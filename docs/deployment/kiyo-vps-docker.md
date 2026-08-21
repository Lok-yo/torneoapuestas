# Despliegue del demo en el VPS de Kiyo

Esta guía publica `torneoapuestas` como demo universitario desechable en `kiyo.idgs8-2.tech`, detrás de Nginx y HTTPS. Docker mantiene Anvil en la red privada y publica la aplicación únicamente en `127.0.0.1:3067`.

> **Advertencias**
>
> - Usa el usuario `kiyo`, IP `2.25.170.208` y SSH en el puerto `2222`.
> - SSH requiere autenticación interactiva con usuario y contraseña. Esta guía no presupone acceso por clave.
> - El dominio `kiyo.idgs8-2.tech` ya resuelve a `2.25.170.208`.
> - El entorno es desechable. No deposites fondos reales ni reutilices la cuenta Anvil fuera de este demo.
> - El candidato `41469b92169d5840da4f113fb7c50659e12f24f4` pasó la verificación en vivo: 198 Vitest, 37 Forge, build Compose sin caché, bootstrap/app/Anvil/settlement, HTTP `/`, `/rpc`, `/__anvil/status`, persistencia de `HouseBank` tras reinicio, reutilización de bootstrap, aislamiento de secretos y ausencia de publicación del puerto Anvil `8545`. La verificación local usó el puerto `3099`; esta guía usa `3067`.

## 1. Resultado y requisitos

Al terminar tendrás estas URLs:

- `https://kiyo.idgs8-2.tech/`
- `https://kiyo.idgs8-2.tech/rpc`
- `https://kiyo.idgs8-2.tech/__anvil/status`

Necesitas:

- Un VPS Debian/Ubuntu con acceso `sudo` para `kiyo`.
- El repositorio local en `/home/kiyo/Proyectos/Aurelio/GG2`.
- El archivo local ignorado `.env.demo`, que ya contiene los valores de Supabase.
- Un perfil nuevo de MetaMask para el demo.

La autenticación SSH no se pudo verificar desde este entorno. Por eso el procedimiento se detiene si el puerto `3067` ya está ocupado; no mata procesos desconocidos ni elige otro puerto.

## 2. Terminal A — local: publicar la rama y preparar `.env.demo`

Ejecuta este bloque en tu equipo local. Primero debes haber incluido este archivo en un commit local; esta guía no crea commits.

```bash
# LOCAL
set -eu
cd /home/kiyo/Proyectos/Aurelio/GG2

test "$(git branch --show-current)" = "fix/poller-settlement-and-ui-fixes"
git ls-files --error-unmatch docs/deployment/kiyo-vps-docker.md >/dev/null
test -z "$(git status --porcelain --untracked-files=all)"
git diff --check

git push --set-upstream origin fix/poller-settlement-and-ui-fixes
```

Personaliza solo `APP_HOST` y `APP_PORT`. El bloque no imprime `.env.demo`, no carga sus secretos y no toca ninguna otra variable.

```bash
# LOCAL
set -eu
cd /home/kiyo/Proyectos/Aurelio/GG2
test -f .env.demo
umask 077
tmp_file=$(mktemp .env.demo.XXXXXX)
trap 'rm -f "$tmp_file"' EXIT HUP INT TERM
if ! awk -v host='kiyo.idgs8-2.tech' -v port='3067' '
  BEGIN { host_count = 0; port_count = 0 }
  /^APP_HOST=/ { print "APP_HOST=" host; host_count++; next }
  /^APP_PORT=/ { print "APP_PORT=" port; port_count++; next }
  { print }
  END { if (host_count != 1 || port_count != 1) exit 1 }
' .env.demo > "$tmp_file"; then
  rm -f "$tmp_file"
  echo 'APP_HOST y APP_PORT deben aparecer exactamente una vez en .env.demo' >&2
  exit 1
fi
chmod 600 "$tmp_file"
mv -f "$tmp_file" .env.demo
trap - EXIT HUP INT TERM
chmod 600 .env.demo
```

## 3. Terminal B — VPS: instalar dependencias, clonar y reservar el puerto

Abre una segunda terminal. La contraseña se solicitará de forma interactiva por SSH.

```bash
# VPS
ssh -p 2222 kiyo@2.25.170.208
```

Ya dentro del VPS, instala y verifica Git, Docker Compose, Nginx, Certbot, `envsubst` y `curl`.

```bash
# VPS
set -eu
sudo apt-get update
sudo apt-get install -y git docker.io docker-compose-v2 nginx certbot python3-certbot-nginx gettext-base curl
sudo systemctl enable --now docker nginx

git --version
docker --version
sudo docker compose version
sudo docker info >/dev/null
nginx -v
certbot --version
envsubst --version
```

Crea el directorio y detente si el puerto está ocupado. No continúes con un proceso desconocido escuchando en `3067`.

```bash
# VPS
set -eu
sudo install -d -m 755 -o kiyo -g kiyo /var/www/kiyo

listen_sockets=$(ss -ltnH)
if printf '%s\n' "$listen_sockets" | awk '
  {
    local_addr = $4
    sub(/^.*:/, "", local_addr)
    if (local_addr == "3067") { print; occupied = 1 }
  }
  END { exit occupied ? 0 : 1 }
'; then
  echo 'DETENIDO: el puerto 3067 ya está ocupado. No se mató ningún proceso.' >&2
  exit 1
fi

test ! -e /var/www/kiyo/torneoapuestas
git clone --branch fix/poller-settlement-and-ui-fixes --single-branch \
  https://github.com/Lok-yo/torneoapuestas.git \
  /var/www/kiyo/torneoapuestas
cd /var/www/kiyo/torneoapuestas
git branch --show-current
git log -1 --oneline
```

## 4. Terminal A — local: copiar `.env.demo` después del clon

Ejecuta este bloque en la terminal local. `scp` solicitará la contraseña del usuario `kiyo`; no uses una clave SSH que no hayas configurado y probado.

```bash
# LOCAL
set -eu
cd /home/kiyo/Proyectos/Aurelio/GG2
test "$(stat -c '%a' .env.demo)" = "600"
scp -P 2222 .env.demo \
  kiyo@2.25.170.208:/var/www/kiyo/torneoapuestas/.env.demo
```

## 5. Terminal B — VPS: validar Compose, construir y levantar

```bash
# VPS
set -eu
cd /var/www/kiyo/torneoapuestas
chmod 600 .env.demo
sudo docker compose --env-file .env.demo config --quiet
sudo docker compose --env-file .env.demo build --no-cache
sudo docker compose --env-file .env.demo up --detach
sudo docker compose --env-file .env.demo ps --all
```

Estados esperados:

- `bootstrap`: `Exited (0)` después de completar.
- `anvil`: `healthy`.
- `app`: `healthy`.
- `settlement`: `Up`.

Comprueba los logs sin imprimir `.env.demo`:

```bash
# VPS
cd /var/www/kiyo/torneoapuestas
sudo docker compose --env-file .env.demo logs --no-log-prefix bootstrap
sudo docker compose --env-file .env.demo logs --no-log-prefix settlement
```

En un estado nuevo, bootstrap debe terminar correctamente. En una ejecución posterior, busca `demo-bootstrap.reused`; settlement debe registrar `settlement-loop.started`.

Confirma el binding de la aplicación y el aislamiento de Anvil:

```bash
# VPS
set -eu
ss -ltnH | awk '{ print }' | grep -E '(^|[[:space:]])127\.0\.0\.1:3067([[:space:]]|$)'
! ss -ltnH | grep -E '(^|[[:space:]])(0\.0\.0\.0:8545|\[::\]:8545|127\.0\.0\.1:8545)([[:space:]]|$)'
```

El navegador llegará a Anvil mediante `/rpc`. El host no debe publicar `8545`.

## 6. Terminal B — VPS: activar Nginx y HTTPS

Ejecuta el bloque desde la raíz del repositorio. `envsubst` sustituye solo `APP_HOST` y `APP_PORT`; no lee ni carga los valores de Supabase.

```bash
# VPS
set -eu
cd /var/www/kiyo/torneoapuestas
(
  set -eu
  APP_HOST='kiyo.idgs8-2.tech'
  APP_PORT='3067'
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

Certbot puede pedir confirmaciones interactivas. Tras terminar, Nginx debe reenviar a `http://127.0.0.1:3067` y conservar sus variables `$host`, `$remote_addr`, `$proxy_add_x_forwarded_for` y `$scheme`.

## 7. Terminal B — VPS: smoke checks HTTPS

Ejecuta las solicitudes exactas y detente ante cualquier respuesta distinta.

```bash
# VPS
set -eu
host='kiyo.idgs8-2.tech'

curl --fail --silent --show-error "https://${host}/" >/dev/null

rpc_response=$(curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "https://${host}/rpc")
printf '%s\n' "$rpc_response"
printf '%s\n' "$rpc_response" | grep -Eq '"result"[[:space:]]*:[[:space:]]*"0x13882"'

status_response=$(curl --fail --silent --show-error \
  -X POST -H 'content-type: application/json' --data '{}' \
  "https://${host}/__anvil/status")
printf '%s\n' "$status_response"
printf '%s\n' "$status_response" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
printf '%s\n' "$status_response" | grep -Eq '"chainId"[[:space:]]*:[[:space:]]*80002'
printf '%s\n' "$status_response" | grep -Eq '"local"[[:space:]]*:[[:space:]]*true'
```

Resultado esperado:

- `/` devuelve HTTP 2xx.
- `/rpc` devuelve chain ID `0x13882`.
- `/__anvil/status` incluye `{"ok":true,"chainId":80002,"local":true}`.

## 8. MetaMask: perfil nuevo y cuenta desechable

Crea un perfil nuevo del navegador para la revisión. En ese perfil:

1. Instala o abre MetaMask.
2. Importa **solo** la cuenta Anvil 1 con esta clave de desarrollo pública:

   ```text
   0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
   ```

3. Agrega una red personalizada:
   - Nombre: `GG2 Anvil Demo`
   - RPC URL: `https://kiyo.idgs8-2.tech/rpc`
   - Chain ID: `80002`
4. No importes cuentas personales ni mantengas activos reales en este perfil.

La clave pertenece a una cuenta Anvil pública y desechable. Cualquier persona puede conocerla. Elimina el perfil al terminar.

## 9. Actualización y comprobación de persistencia

### Actualizar código

Ejecuta en el VPS. Primero se respalda `gg2-demo-state`; después, `pull --ff-only` evita mezclar cambios locales del servidor.

```bash
# VPS
set -eu
cd /var/www/kiyo/torneoapuestas
test -z "$(git status --porcelain --untracked-files=all)"

mkdir -p backups
sudo docker compose --env-file .env.demo stop anvil
sudo docker run --rm --user 0:0 \
  -v gg2-demo-state:/source:ro \
  -v "$PWD/backups:/backup" \
  node@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 \
  sh -c 'tar -C /source -czf /backup/gg2-demo-state.tgz .'
test -s backups/gg2-demo-state.tgz
sudo docker compose --env-file .env.demo start anvil

git fetch origin fix/poller-settlement-and-ui-fixes
git checkout fix/poller-settlement-and-ui-fixes
git pull --ff-only origin fix/poller-settlement-and-ui-fixes
sudo docker compose --env-file .env.demo config --quiet
sudo docker compose --env-file .env.demo build --no-cache
sudo docker compose --env-file .env.demo up --detach
sudo docker compose --env-file .env.demo ps --all
```

### Reiniciar sin perder `HouseBank`

Este bloque conserva el volumen `gg2-demo-state`, reinicia Anvil/app/settlement y ejecuta bootstrap para verificar que reutiliza el estado.

```bash
# VPS
set -eu
cd /var/www/kiyo/torneoapuestas

before_code=$(sudo docker compose --env-file .env.demo exec -T settlement sh -lc \
  '. /demo-state/public.env; cast code "$VITE_HOUSE_BANK_ADDRESS" --rpc-url http://anvil:8545')
before_block=$(curl --silent -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  'https://kiyo.idgs8-2.tech/rpc')

sudo docker compose --env-file .env.demo restart anvil app settlement
sudo docker compose --env-file .env.demo ps --all
if ! bootstrap_output=$(sudo docker compose --env-file .env.demo run --rm bootstrap 2>&1); then
  printf '%s\n' "$bootstrap_output" >&2
  exit 1
fi
printf '%s\n' "$bootstrap_output"
printf '%s\n' "$bootstrap_output" | grep -F 'demo-bootstrap.reused'

after_code=$(sudo docker compose --env-file .env.demo exec -T settlement sh -lc \
  '. /demo-state/public.env; cast code "$VITE_HOUSE_BANK_ADDRESS" --rpc-url http://anvil:8545')
after_block=$(curl --silent -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  'https://kiyo.idgs8-2.tech/rpc')

test "$before_code" = "$after_code"
test "$after_code" != "0x"
printf 'bloque antes: %s\nbloque después: %s\n' "$before_block" "$after_block"
```

El bytecode debe coincidir, no debe ser `0x`, y el bloque posterior no debe volver a génesis.

## 10. Diagnóstico común

```bash
# VPS
cd /var/www/kiyo/torneoapuestas
sudo docker compose --env-file .env.demo ps --all
sudo docker compose --env-file .env.demo logs --tail=100 bootstrap
sudo docker compose --env-file .env.demo logs --tail=100 app
sudo docker compose --env-file .env.demo logs --tail=100 anvil
sudo docker compose --env-file .env.demo logs --tail=100 settlement
sudo docker compose --env-file .env.demo config --quiet
sudo nginx -t
ss -ltnH
```

- `bootstrap` falla: revisa sus logs y confirma que `anvil` alcanzó `healthy`.
- `app` no está `healthy`: confirma `bootstrap`, `anvil`, `APP_HOST`, `APP_PORT` y el binding `127.0.0.1:3067`.
- Nginx falla: ejecuta `sudo nginx -t`; no edites el template para publicar `8545`.
- `/rpc` falla: confirma que Nginx apunta a `127.0.0.1:3067` y que `app` está saludable.
- No borres `gg2-demo-state` durante un reinicio normal; ese volumen conserva el estado de Anvil.

## 11. Desmontaje completo después de la revisión

### VPS

Ejecuta el bloque para detener Compose, eliminar sus volúmenes, retirar Nginx, borrar `.env.demo` y eliminar el clon del servidor.

```bash
# VPS
set -eu
cd /var/www/kiyo/torneoapuestas
sudo docker compose --env-file .env.demo down --volumes --remove-orphans
sudo rm -f /etc/nginx/sites-enabled/gg2 /etc/nginx/sites-available/gg2
sudo nginx -t
sudo systemctl reload nginx
rm -f /var/www/kiyo/torneoapuestas/.env.demo
rm -rf /var/www/kiyo/torneoapuestas
rmdir /var/www/kiyo 2>/dev/null || true
```

Si ningún otro servicio usa este certificado, elimina también el certificado de Certbot:

```bash
# VPS
sudo certbot delete --cert-name kiyo.idgs8-2.tech
```

### Local y navegador

Después de confirmar que ya no necesitas el demo, elimina el archivo local y el perfil de navegador desechable.

```bash
# LOCAL
set -eu
rm -f /home/kiyo/Proyectos/Aurelio/GG2/.env.demo
```

En el navegador, elimina manualmente el perfil que contenía MetaMask y la cuenta Anvil 1. No reutilices esa cuenta para activos reales.
