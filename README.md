# Data Manager

一个基于 `adminer-master` 思路整理出来的单镜像可视化数据库管理项目。现在所有需要的运行代码都放在 `data-manager` 目录里，部署时**只需要一个 `data-manager` 容器**，不再额外安装 `adminer-master` 容器。

## 当前实现方式

- `data-manager` 单容器内同时包含：
  - Node.js 应用界面与 API
  - 基于 `adminer-master` 源码整理进来的 Adminer 页面
- 访问同一个服务即可使用：
  - `/`：Data Manager 主界面
  - `/adminer/index.php`：内置 Adminer
- Compose 中不出现数据库连接信息
- 数据库连接通过页面弹窗或表单输入

## 目录说明

- `adminer-source/adminer/`：从 `adminer-master` 复制进来的 Adminer 源码
- `src/`：Node.js 后端
- `public/`：前端页面
- `docker/apache/`：单容器内 Apache 反向代理配置
- `docker/supervisord.conf`：单容器内同时启动 Apache 与 Node
- `data/`：映射后的数据目录
- `scripts/`：映射后的脚本目录
- `logs/`：脚本日志目录
- `storage/`：连接与脚本配置持久化目录

## 快速启动

```bash
docker compose pull && docker compose up -d
```

访问：

- 主界面：`http://你的服务器IP:3022`
- 内置 Adminer：`http://你的服务器IP:3022/adminer/index.php`

## Compose 示例

```yaml
services:
  data-manager:
    image: ghcr.io/lc010224/data-manager:latest
    container_name: data-manager
    restart: unless-stopped
    ports:
      - "3022:80"
    environment:
      - TZ=Asia/Shanghai
      - PORT=3000
      - ADMINER_URL=/adminer/index.php
      - DATA_ROOT=/app/data
      - SCRIPTS_ROOT=/app/scripts
      - LOGS_ROOT=/app/logs
      - STORAGE_ROOT=/app/storage
    volumes:
      - /home/data-manager/data:/app/data
      - /home/data-manager/scripts:/app/scripts
      - /home/data-manager/logs:/app/logs
      - /home/data-manager/storage:/app/storage
```

## 发布 latest

推送到 `main` 后自动构建：

- `ghcr.io/lc010224/data-manager:latest`
- `ghcr.io/lc010224/data-manager:<commit-sha>`

## 当前限制

- 差异同步目前自动写回仅支持 MySQL / MariaDB
- 文件比对当前支持 `JSON` 和 `CSV`
- PostgreSQL 暂时支持连接与查询，不支持自动 upsert 同步
- 连接信息当前保存在挂载的 `storage` 目录 JSON 文件中，尚未加密
