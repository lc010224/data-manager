# Data Manager

一个基于 `adminer-master` 思路扩展出来的可视化数据库管理项目，镜像发布到 `ghcr.io/lc010224`，部署时通过 `docker compose` 直接拉取 `latest`。

## 已实现方向

- 内嵌 Adminer 工作台，复用其数据库连接、表结构、SQL 执行与基础管理能力
- 自定义浅色现代化侧边栏界面
- 数据目录浏览与 JSON/CSV -> 数据库表差异比对
- 将“仅文件侧新增”的记录同步到 MySQL 表
- 脚本目录浏览、脚本配置、手动执行、Cron 定时、日志查看
- Compose 拉取 `latest` 镜像部署
- GitHub Actions 自动推送 GHCR `latest`
- Compose 中不保存数据库连接信息，统一在界面弹窗/表单录入

## 目录说明

- `src/`：Node.js 后端
- `public/`：前端页面
- `docker/adminer/`：Adminer 容器镜像构建目录
- `data/`：映射后的数据目录
- `scripts/`：映射后的脚本目录
- `logs/`：脚本日志目录
- `storage/`：连接与脚本配置持久化目录

## 快速启动

直接使用：

```bash
docker compose pull && docker compose up -d
```

访问：

- 主界面：`http://你的服务器IP:3000`
- Adminer：`http://你的服务器IP:8080`

数据库账号、主机、端口、库名不会写在 compose 中，而是在页面里通过弹窗输入并保存。

## Compose 示例

当前 `docker-compose.yml` 已改为拉取 `latest`：

```yaml
services:
  data-manager:
    image: ghcr.io/lc010224/data-manager:latest
    container_name: data-manager
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - TZ=Asia/Shanghai
      - ADMINER_URL=http://your-server-ip:8080
      - DATA_ROOT=/app/data
      - SCRIPTS_ROOT=/app/scripts
      - LOGS_ROOT=/app/logs
      - STORAGE_ROOT=/app/storage
    volumes:
      - /home/data-manager/data:/app/data
      - /home/data-manager/scripts:/app/scripts
      - /home/data-manager/logs:/app/logs
      - /home/data-manager/storage:/app/storage

  data-manager-adminer:
    image: ghcr.io/lc010224/data-manager-adminer:latest
    container_name: data-manager-adminer
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - TZ=Asia/Shanghai
```

## 发布 latest

`main` 分支推送后，GitHub Actions 会自动推送：

- `ghcr.io/lc010224/data-manager:latest`
- `ghcr.io/lc010224/data-manager-adminer:latest`
- 对应 commit sha 标签

## 当前限制

- 差异同步目前自动写回仅支持 MySQL / MariaDB
- 文件比对当前支持 `JSON` 和 `CSV`
- PostgreSQL 暂时支持连接与查询，不支持自动 upsert 同步
- 连接信息当前保存在挂载的 `storage` 目录 JSON 文件中，尚未加密
