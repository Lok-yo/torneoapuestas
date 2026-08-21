FROM ghcr.io/foundry-rs/foundry@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd AS foundry

USER root
RUN mkdir -p /app/contracts && chown -R foundry:foundry /app
USER foundry
WORKDIR /app/contracts
COPY --chown=foundry:foundry contracts/ ./
RUN forge install --no-git \
      foundry-rs/forge-std@467ffd422ca01fed5797a4c766a1e4e3a5327902 \
      OpenZeppelin/openzeppelin-contracts@dc44c9f1a4c3b10af99492eed84f83ed244203f6 \
    && forge build

FROM foundry AS anvil

USER root
RUN mkdir -p /demo-state && chown 1000:1000 /demo-state
USER foundry
ENTRYPOINT ["anvil"]

FROM node@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast
COPY --from=foundry --chown=node:node /home/foundry/.svm /home/node/.svm
COPY --from=foundry /app/contracts ./contracts
RUN mkdir -p /demo-state \
    && chown -R 1000:1000 /app /demo-state
USER node
EXPOSE 3000
ENTRYPOINT ["scripts/demo-entrypoint.sh"]
