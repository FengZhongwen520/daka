# Daka 测试环境部署

测试环境使用 BaoTa + Nginx 托管静态文件。发布入口固定为
[`deploy.sh`](./deploy.sh)，不要手工复制 `dist` 或直接改线上目录。
Windows 用户直接运行项目根目录的 [`deploy.ps1`](../deploy.ps1) 即可。

## 目标环境

| 项目 | 值 |
| --- | --- |
| 公网地址 | <http://106.55.36.254:23562/> |
| SSH | `ubuntu@106.55.36.254:22` |
| 站点目录 | `/www/wwwroot/MyFront/daka` |
| 目录所有者 | `www:www` |
| 发布分支 | `test` |
| 保留版本 | 最近 3 个旧版本 |

Windows 部署入口使用 Git Bash：
`C:\Program Files\Git\bin\bash.exe`。

## 首次配置

首次运行时，`deploy.ps1` 会自动根据示例配置创建被 Git 忽略的
`deploy/baota.env`。也可以手动执行：

```powershell
Copy-Item deploy/baota.env.example deploy/baota.env
```

`deploy/baota.env` 已被 Git 忽略，只保存非敏感的目标配置。默认内容已经对应
当前服务器，通常不需要修改。

推荐使用 SSH 密钥。把本机公钥加入服务器的
`/home/ubuntu/.ssh/authorized_keys`，然后在本地配置中指定私钥：

```text
DAKA_DEPLOY_SSH_KEY=/c/Users/luhao/.ssh/id_ed25519
```

确认服务器允许非交互 `sudo`，脚本切换发布目录时需要：

```bash
ssh ubuntu@106.55.36.254 'sudo -n true && echo SUDO_OK'
```

不要把密码、私钥或面板密码写进仓库、环境文件或命令参数。

## 日常发布

只发布已经提交并进入 `test` 的代码。工作区有未提交改动时脚本会拒绝执行。

```powershell
git switch test
git pull --ff-only
git status
.\deploy.ps1 -DryRun
.\deploy.ps1
```

执行顺序：

1. `npm ci` 安装依赖。
2. `npm run build` 生成静态文件。
3. 通过单次 SSH 会话上传到站点目录同级的临时目录。
4. 用 `sudo -n` 原子切换线上目录，恢复 `www:www` 归属并清理旧版本。
5. 请求公网地址做健康检查。

看到 `Deployed test commit <commit>` 和 `Health check passed` 才算成功。

`deploy.ps1` 使用 npm 时对应的命令是 `npm run deploy` 和
`npm run deploy:dry-run`。dry-run 也会构建，但不会连接服务器或修改线上文件。

## 认证与故障排查

- SSH 提示 `Permission denied (publickey)`：先检查服务器里的公钥、用户名和
  `DAKA_DEPLOY_SSH_KEY`。如果密钥认证仍被服务器提前断开，可在终端运行
  `.\deploy.ps1`，按提示输入密码；密码只用于本次单次 SSH 连接。
- 提示 `Working tree is not clean`：先提交或处理本地改动，脚本不会打包脏工作区。
- 提示 `sudo: a password is required`：服务器未给 `ubuntu` 配置所需的
  `NOPASSWD` 权限，需要由服务器管理员调整后再部署。
- 健康检查失败：先检查 Nginx 和公网端口，不要跳过健康检查。

宝塔面板地址、账号和密码属于服务器凭据，统一保存在密码管理器中，不写入仓库。
