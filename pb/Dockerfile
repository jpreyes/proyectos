ARG PB_VERSION=0.39.10

FROM alpine:3.21 AS fetch
ARG PB_VERSION
RUN apk add --no-cache ca-certificates unzip wget
RUN wget -q -O /tmp/pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
 && unzip -q /tmp/pb.zip -d /pb \
 && rm /tmp/pb.zip

FROM alpine:3.21
RUN apk add --no-cache ca-certificates wget tzdata
ENV TZ=America/Santiago
COPY --from=fetch /pb/pocketbase /usr/local/bin/pocketbase

WORKDIR /pb
EXPOSE 8090

# pb_data is a named volume; pb_migrations and pb_hooks are bind-mounted
# read-only from the repo.
CMD ["pocketbase", "serve", \
     "--http=0.0.0.0:8090", \
     "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/pb_migrations", \
     "--hooksDir=/pb/pb_hooks"]
