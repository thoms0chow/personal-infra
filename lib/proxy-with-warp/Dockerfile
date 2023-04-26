# https://github.com/shadowsocks/go-shadowsocks2
FROM --platform=linux/amd64 golang:1.15.0-alpine3.12 AS builder

ENV GO111MODULE on
ENV GOPROXY https://goproxy.cn

RUN apk upgrade \
    && apk add git \
    && go get github.com/shadowsocks/go-shadowsocks2

FROM --platform=linux/amd64 monius/docker-warp-socks:latest as dist

RUN apt-get -y update \
    && apt-get -y install tzdata linux-virtual \
     && apt-get -y reinstall wireguard-dkms


COPY --from=builder /go/bin/go-shadowsocks2 /usr/bin/shadowsocks

ENV SS_ALGORITHM AEAD_CHACHA20_POLY1305
ENV SS_PASSWORD password

# ENTRYPOINT shadowsocks -s ss://${SS_ALGORITHM}:${SS_PASSWORD}@:8388 -verbose
