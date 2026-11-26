# daka_serve

`daka_serve` 是页巢的 Java 后端，使用 DDD 分层，为登录用户保存组件数据。

## 领域边界

- `domain`：用户、会话、加密存储记录，以及仓库和加密能力端口。
- `application`：注册、登录、会话校验、存储数据的用例编排。
- `interfaces.rest`：HTTP 控制器和统一错误响应。
- `infrastructure`：JPA/H2 持久化、AES-256-GCM、PBKDF2、HMAC 和 Bearer 认证。

普通组件数据以现有前端的键值/JSON 结果保存。番茄钟和饮水是云端专属领域功能，使用独立 REST 与 WebSocket：

- 番茄钟倒计时由后端权威计算，运行中每 5 秒推送，操作和阶段切换立即推送。
- 饮水记录按日期保存在服务端，每次加水通过 WebSocket 通知当前用户的其他客户端。
- 照片云端只保存 `local-photo://...` 引用，图片内容留在当前设备的 IndexedDB。

记录按用户隔离；业务状态、存储键和值均加密，账号标识加密，密码只保存 PBKDF2 哈希，会话令牌只保存 SHA-256 哈希。

## 本地启动

```powershell
npm run serve:dev
```

首次运行会生成被 Git 忽略的 `.env.local`，其中包含加密密钥。该文件必须备份；密钥变化后已有云端数据无法解密。

前端开发服务器会把 `/api` 代理到 `http://localhost:8080`：

```powershell
npm run dev
```

## 测试

```powershell
npm run test:serve
npm run test:all
```

测试覆盖全部组件的数据形态、加密落盘、账号隔离、删除与清空。前端构建会校验所有组件已接入统一存储入口。

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/serve/health`
- `GET /api/storage`
- `PUT /api/storage`
- `DELETE /api/storage?key=...`
- `DELETE /api/storage/all`
- `GET|POST /api/pomodoro/...`
- `GET|POST /api/water/...`
- `POST /api/realtime/ticket`
- `WS /ws/realtime?ticket=...`

除注册和登录外，均要求 `Authorization: Bearer <token>`。

## 数据与密钥

默认使用 `daka_serve/data` 下的 H2 文件库。生产部署时应配置：

- `DAKA_ENCRYPTION_KEY`：Base64 编码的 32 字节 AES 密钥。
- `DAKA_LOOKUP_PEPPER`：Base64 编码、至少 32 字节的查询索引密钥。
- `DAKA_DB_URL`、`DAKA_DB_USERNAME`、`DAKA_DB_PASSWORD`：数据库连接。
- `DAKA_CORS_ORIGINS`：允许访问 API 的前端来源，逗号分隔。

密钥不得提交到仓库。生产环境应使用独立、受备份保护的密钥管理系统，并在发布前验证数据库备份和恢复流程。

## 当前宝塔部署

测试服务器已按以下结构部署：

| 项目 | 值 |
| --- | --- |
| 服务目录 | `/www/wwwroot/MyFront/daka_serve` |
| JAR | `/www/wwwroot/MyFront/daka_serve/daka-serve.jar` |
| 密钥文件 | `/www/wwwroot/MyFront/daka_serve/daka-serve.env`，权限 `600` |
| 数据库 | `/www/wwwroot/MyFront/daka_serve/data` |
| 本机端口 | `127.0.0.1:18080` |
| systemd | `daka-serve.service` |
| Nginx 配置 | `daka-serve.conf` |
| 公网健康检查 | <http://106.55.36.254:23562/api/serve/health> |

systemd 和 Nginx 模板见 [`deploy/`](./deploy)。日常更新 JAR 后执行：

```bash
sudo systemctl restart daka-serve
curl -fsS http://127.0.0.1:18080/api/serve/health
sudo /www/server/nginx/sbin/nginx -t
```

不要删除或重建 `daka-serve.env`。如果更换 AES 密钥，已有云端数据将无法解密。
