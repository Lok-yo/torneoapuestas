# Demo universitario desechable en un VPS

Este procedimiento publica una copia temporal de COLISEUM para una revisión universitaria. El VPS expone un solo puerto HTTPS mediante Nginx. Docker mantiene Anvil y el worker de liquidación dentro de la red privada; el navegador llega a Vite y a Anvil a través de rutas del mismo origen.

> **Alcance:** este entorno es desechable y no está listo para producción. Usa una instancia Anvil con cuentas de desarrollo, datos Supabase existentes y un worker de Compose. No deposites fondos reales.

## Ruta rápida

1. Copia `.env.demo.example`, completa sus cinco valores y valida Compose.
2. Levanta `anvil`, `bootstrap`, `app` y `settlement`; espera las condiciones de salud.
3. Renderiza el sitio Nginx, ejecuta Certbot y verifica HTTPS/RPC.
4. Revisa la wallet de prueba, comprueba persistencia y elimina el demo al terminar.

## 1. Preparar el VPS y levantar Compose

Ejecuta estos comandos desde la raíz del repositorio, en el VPS:

```bash
cp .env.demo.example .env.demo
chmod 600 .env.demo
# Fill the five required values with the university DNS/port and the existing Supabase project values.
docker compose --env-file .env.demo config --quiet
docker compose --env-file .env.demo up --build --detach
docker compose --env-file .env.demo ps
docker compose --env-file .env.demo logs bootstrap
docker compose --env-file .env.demo logs settlement
```

Antes de configurar Nginx, confirma lo siguiente:

- `bootstrap` termina con `Exited (0)`.
- `anvil` aparece `healthy`.
- `app` aparece `healthy`.
- Los logs de `settlement` contienen `settlement-loop.started`.

`APP_HOST` debe ser el DNS universitario que apuntará al VPS. `APP_PORT` debe ser el puerto asignado para el binding de loopback de Vite (por ejemplo, un puerto `30XX`). Completa también `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` con los valores del proyecto Supabase existente. No copies esos valores a esta documentación ni al repositorio.

Compose publica únicamente `127.0.0.1:${APP_PORT}:3000` en el host. Anvil escucha `8545` dentro de Docker, en la red privada `demo-backend`; no se debe publicar ese puerto en el VPS.

## 2. Activar Nginx y HTTPS

El archivo `deploy/nginx/gg2.conf.template` recibe `APP_HOST` y `APP_PORT`. `envsubst` debe sustituir **solo** esas dos variables para conservar `$host`, `$remote_addr`, `$proxy_add_x_forwarded_for` y `$scheme`, que pertenecen a Nginx.

```bash
(
  set -eu
  demo_value() {
    awk -F= -v key="$1" '
      $1 == key { value = substr($0, index($0, "=") + 1); count++ }
      END {
        if (count != 1 || value == "") exit 1
        print value
      }
    ' .env.demo
  }
  APP_HOST=$(demo_value APP_HOST)
  APP_PORT=$(demo_value APP_PORT)
  case "$APP_HOST" in
    ''|*[!A-Za-z0-9.-]*) echo 'APP_HOST must be a simple DNS hostname' >&2; exit 1 ;;
  esac
  case "$APP_PORT" in
    ''|*[!0-9]*) echo 'APP_PORT must be numeric' >&2; exit 1 ;;
  esac
  export APP_HOST APP_PORT
  envsubst '${APP_HOST} ${APP_PORT}' < deploy/nginx/gg2.conf.template | \
    sudo tee /etc/nginx/sites-available/gg2 >/dev/null
  sudo ln -sfn /etc/nginx/sites-available/gg2 /etc/nginx/sites-enabled/gg2
  sudo nginx -t
  sudo systemctl reload nginx
  sudo certbot --nginx -d "$APP_HOST"
  sudo nginx -t
  sudo systemctl reload nginx
)
```

El bloque se ejecuta en un subshell y extrae solo `APP_HOST` y `APP_PORT` con `awk`; no carga `.env.demo` en el entorno. Por eso `SUPABASE_SERVICE_ROLE_KEY` nunca se exporta a `envsubst`, `sudo` ni Certbot.

El template produce `/etc/nginx/sites-available/gg2` y el enlace activo `/etc/nginx/sites-enabled/gg2`. No hace falta un `upstream` separado para Anvil: `/rpc` llega al mismo puerto de Vite y Vite lo reenvía por la red privada de Docker.

Las URLs públicas esperadas son:

- `https://${APP_HOST}/`
- `https://${APP_HOST}/__anvil/status`
- `https://${APP_HOST}/rpc`

## 3. Smoke checks del navegador y RPC

Carga la página y comprueba las dos rutas de soporte y RPC con las solicitudes exactas siguientes:

```bash
curl --fail --silent --show-error "https://${APP_HOST}/" >/dev/null
curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "https://${APP_HOST}/rpc"
curl --fail --silent --show-error \
  -X POST -H 'content-type: application/json' --data '{}' \
  "https://${APP_HOST}/__anvil/status"
```

El resultado JSON-RPC debe contener `0x13882`. El helper debe responder con este cuerpo:

```json
{"ok":true,"chainId":80002,"local":true}
```

Confirma el límite de red del host. El puerto asignado debe escuchar solo en loopback; no deben aparecer bindings de Anvil:

```bash
ss -ltn
ss -ltn | grep -F "127.0.0.1:${APP_PORT}" >/dev/null
! ss -ltn | grep -E '(^|[[:space:]])(0\.0\.0\.0:8545|\[::\]:8545|127\.0\.0\.1:8545)([[:space:]]|$)'
```

Si falla la última aserción, detén el demo y elimina cualquier publicación de `8545` antes de continuar. La ruta pública de Anvil es `/rpc`, no `:8545`.

## 4. Revisión con una wallet falsa

Crea un perfil nuevo del navegador para la revisión. Importa **solo** la cuenta Anvil 1 con esta clave de desarrollo pública:

```text
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

En MetaMask agrega la red con:

- Chain ID: `80002`
- RPC URL: `https://${APP_HOST}/rpc`

> **CLAVE PÚBLICA DE DESARROLLO ANVIL:** todo el mundo conoce esta clave. Nunca le envíes fondos reales ni la uses fuera de este demo. Elimina el perfil del navegador junto con el entorno al terminar la revisión.

## 5. Verificar persistencia tras un reinicio

Captura el bytecode de `HouseBank` y el bloque actual, reinicia los servicios ordinarios y vuelve a ejecutar el bootstrap para comprobar que reutiliza el estado persistente:

```bash
before_code=$(docker compose --env-file .env.demo exec -T settlement sh -lc \
  '. /demo-state/public.env; cast code "$VITE_HOUSE_BANK_ADDRESS" --rpc-url http://anvil:8545')
before_block=$(curl --silent -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  "https://${APP_HOST}/rpc")
docker compose --env-file .env.demo restart anvil app settlement
docker compose --env-file .env.demo ps
docker compose --env-file .env.demo run --rm bootstrap
after_code=$(docker compose --env-file .env.demo exec -T settlement sh -lc \
  '. /demo-state/public.env; cast code "$VITE_HOUSE_BANK_ADDRESS" --rpc-url http://anvil:8545')
test "$before_code" = "$after_code"
test "$after_code" != "0x"
printf '%s\n%s\n' "$before_block" \
  "$(curl --silent -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' "https://${APP_HOST}/rpc")"
```

Espera estos resultados:

- Los logs de bootstrap contienen `demo-bootstrap.reused`.
- `after_code` coincide con `before_code` y no es `0x`.
- El bloque posterior al reinicio no vuelve a génesis. Compara los dos valores impresos; Anvil debe conservar el estado de `gg2-demo-state`.

## 6. Respaldar antes de cambiar imágenes

Detén Anvil antes de copiar el volumen. El digest del contenedor de respaldo queda fijado para que el procedimiento sea reproducible:

```bash
mkdir -p backups
docker compose --env-file .env.demo stop anvil
docker run --rm --user 0:0 \
  -v gg2-demo-state:/source:ro -v "$PWD/backups:/backup" \
  node@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 \
  sh -c 'tar -C /source -czf /backup/gg2-demo-state.tgz .'
docker compose --env-file .env.demo start anvil
```

Verifica que `backups/gg2-demo-state.tgz` exista antes de cambiar una imagen. Conserva el volumen si la nueva imagen mantiene compatible el manifiesto de contrato/runtime.

## 7. Rollback y reinicio deliberado

Para hacer rollback de código, vuelve al último commit atómico conocido como bueno (mediante `git checkout` o `git revert`) y reconstruye:

```bash
docker compose --env-file .env.demo up --build --detach
```

Mantén `gg2-demo-state` solo cuando el manifiesto de contrato/runtime siga siendo compatible. Si necesitas una cadena Anvil nueva, elimina el estado de forma deliberada:

```bash
docker compose --env-file .env.demo down
docker volume rm gg2-demo-state
docker compose --env-file .env.demo up --build --detach
```

**Límite de rollback:** antes de revertir el commit de documentación/configuración, elimina el enlace del sitio Nginx y recarga Nginx para que el tráfico deje de llegar al demo:

```bash
sudo rm -f /etc/nginx/sites-enabled/gg2
sudo nginx -t
sudo systemctl reload nginx
```

La eliminación del certificado de Certbot es opcional mientras el entorno siga fuera de servicio.

## 8. Desmontaje final

Después de la revisión, elimina los datos, el enrutamiento TLS, el perfil de navegador desechable y el archivo local de variables:

```bash
docker compose --env-file .env.demo down --volumes --remove-orphans
sudo rm -f /etc/nginx/sites-enabled/gg2 /etc/nginx/sites-available/gg2
sudo nginx -t
sudo systemctl reload nginx
rm -f .env.demo
rm -rf backups
```

Confirma que el perfil de navegador que importó la clave pública también quedó eliminado. Si Certbot dejó certificados del DNS temporal, bórralos según la política del VPS después de confirmar que ningún servicio los necesita.
