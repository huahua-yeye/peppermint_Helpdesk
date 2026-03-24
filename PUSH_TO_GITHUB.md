# 将 Peppermint 项目 Push 到自己的 GitHub 仓库指南

本文档指导你如何将本地的 Peppermint 项目推送到你自己的 GitHub 仓库，同时遵守 [Peppermint-Lab/peppermint](https://github.com/Peppermint-Lab/peppermint) 的许可协议。

---

## 前置准备

1. **确保已安装 Git**  
   ```powershell
   git --version
   ```

2. **配置 Git 用户信息**（如未配置）  
   ```powershell
   git config --global user.name "你的用户名"
   git config --global user.email "your@email.com"
   ```

3. **在 GitHub 创建新仓库**  
   - 打开 [GitHub](https://github.com/new)
   - 创建一个新仓库（例如 `peppermint-webarena`）
   - **不要**勾选 "Add a README file"（本地已有代码）
   - 创建后复制仓库地址（如 `https://github.com/你的用户名/peppermint-webarena.git`）

---

## 操作步骤

### 方案 A：当前目录是 `peppermint_webarena`（包含 peppermint 子目录）

如果你的项目根目录是 `peppermint_webarena`，且 peppermint 是子目录：

```powershell
# 1. 进入项目根目录
cd c:\Users\25781\Desktop\peppermint_webarena

# 2. 初始化 Git 仓库（若尚未初始化）
git init

# 3. 添加远程仓库
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 4. 添加所有文件
git add .

# 5. 提交
git commit -m "Initial commit: Peppermint webarena (based on Peppermint-Lab/peppermint)"

# 6. 推送到 main 分支（或 master）
git branch -M main
git push -u origin main
```

### 方案 B：当前目录是 `peppermint`（Peppermint 项目根目录）

如果你只打算推送 `peppermint` 子目录：

```powershell
# 1. 进入 peppermint 目录
cd c:\Users\25781\Desktop\peppermint_webarena\peppermint

# 2. 若已有 .git 且来自 fork/clone，可移除原 remote 并添加自己的
git remote -v
git remote remove origin   # 若存在
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 3. 添加、提交并推送
git add .
git commit -m "Initial commit: Peppermint webarena (based on Peppermint-Lab/peppermint)"
git branch -M main
git push -u origin main
```

---

## 重要提醒：许可证合规

- ✅ **README 已更新**：`peppermint/README.md` 中已添加许可证与来源说明，遵守 Peppermint 的 license 要求。
- ✅ **保留 license 文件**：项目中的 `peppermint/license` 文件必须保留，不要删除。
- ⚠️ **AGPLv3 要求**：若你修改了受 AGPLv3 约束的代码，你的修改也需要在相同许可下开源。
- ⚠️ **商业许可部分**：Peppermint 核心代码有商业许可条款，请仔细阅读 [license 文件](https://github.com/Peppermint-Lab/peppermint/blob/main/license)。

---

## 推送前检查清单

- [ ] `.env`、`.env.local` 等敏感文件已在 `.gitignore` 中（已包含）
- [ ] `node_modules` 等依赖目录已在 `.gitignore` 中（已包含）
- [ ] README 中已说明来源和许可证（已完成）
- [ ] 已在 GitHub 创建新仓库

---

## 常见问题

**Q: 推送时提示需要登录？**  
A: 使用 HTTPS 时，GitHub 会提示输入用户名和 Personal Access Token（不再支持密码）。可在 [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) 创建 Token。

**Q: 推送时提示 "remote origin already exists"？**  
A: 先执行 `git remote remove origin`，再添加新的 remote。

**Q: 本地已有 .git 且是从原项目 clone 的？**  
A: 可以保留历史，只需更换 remote 为你的仓库地址，然后 push 即可。
