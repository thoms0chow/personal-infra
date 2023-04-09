# https://github.com/shadowsocks/go-shadowsocks2
FROM golang:1.15.0-alpine3.12 AS builder

ENV GO111MODULE on
ENV GOPROXY https://goproxy.cn

RUN apk upgrade \
    && apk add git \
    && go get github.com/shadowsocks/go-shadowsocks2

FROM alpine:3.12 AS dist

LABEL maintainer="mritd <mritd@linux.com>"

RUN apk upgrade \
    && apk add tzdata \
    && rm -rf /var/cache/apk/*

COPY --from=builder /go/bin/go-shadowsocks2 /usr/bin/shadowsocks

ENV SS_ALGORITHM AEAD_CHACHA20_POLY1305
ENV SS_PASSWORD password

ENTRYPOINT shadowsocks -s ss://${SS_ALGORITHM}:${SS_PASSWORD}@:8388 -verbose
