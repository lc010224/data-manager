FROM php:8.2-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg ca-certificates supervisor \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && docker-php-ext-install mysqli pdo pdo_mysql \
    && a2enmod proxy proxy_http rewrite \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .

RUN rm -rf /var/www/html/* \
    && mkdir -p /var/www/html/adminer \
    && cp -r /app/adminer-source/adminer/* /var/www/html/adminer/ \
    && printf '%s\n' '<?php' 'header("Location: /adminer/index.php");' 'exit;' > /var/www/html/index.php \
    && cat /app/docker/adminer/adminer.css >> /var/www/html/adminer/static/default.css

COPY docker/apache/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 3000 80
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
