FROM php:8.2-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && docker-php-ext-install mysqli pdo pdo_mysql \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN curl -L https://github.com/vrana/adminer/archive/refs/heads/master.zip -o adminer.zip \
    && unzip adminer.zip \
    && rm -rf /var/www/html/* \
    && mkdir -p /var/www/html/adminer \
    && cp -r /tmp/adminer-master/adminer/* /var/www/html/adminer/ \
    && rm -rf /tmp/adminer-master /tmp/adminer.zip

COPY index.php /var/www/html/index.php
COPY adminer.css /tmp/adminer.css
RUN cat /tmp/adminer.css >> /var/www/html/adminer/static/default.css && rm /tmp/adminer.css
