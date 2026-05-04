# Argon Lite / Hyper Console 独立博客：小白部署教程（尽量免费 + 图片上传）

这个项目是一个不依赖 WordPress 的独立博客系统，前台保留 Argon 的清爽内容展示，后台则升级为更接近小米澎湃 OS（HyperOS）风格的轻盈玻璃界面：

- 前台：文章列表、文章详情、分类、标签、搜索、评论、夜间模式
- 后台：登录、新建文章、编辑文章、上传封面图、上传正文图、上传头像、站点设置
- 后端：Node.js + Express
- 数据库：本地 JSON / Supabase PostgreSQL
- 图片：本地测试 / Supabase Storage / Cloudflare R2

---

## 0. 最推荐的免费路线

### 小白优先路线：最省事

```text
GitHub：放代码，免费
Render：运行网站和后端，免费但会休眠
Supabase PostgreSQL：保存文章和评论，免费额度够小站用
Supabase Storage：保存图片，免费 1GB
域名：自己买，几十元/年左右
```

优点：步骤少，账号少，不容易错。  
缺点：图片免费空间只有 1GB，访问量大了之后可能不够。

### 性价比更高路线：图片多时推荐

```text
GitHub：放代码
Render：运行网站和后端
Supabase PostgreSQL：保存文章和评论
Cloudflare R2：保存图片，免费额度更大，出站流量免费
域名：自己买
```

优点：R2 图片存储免费额度更大，更适合放很多商品图、作品图。  
缺点：Cloudflare R2 设置比 Supabase Storage 多几步，部分账号可能需要绑定付款方式或开通 R2，但只要不超免费额度就不收费。

---

## 1. 费用结论

前期可以做到：

```text
代码仓库：0 元
网站运行：0 元
数据库：0 元
图片存储：0 元
HTTPS 证书：0 元
域名：自己买
```

真正要注意的是：

1. Render 免费版 15 分钟没人访问会休眠，下一次打开要等一会儿。
2. 不要把正式图片存在 Render 本地文件里，因为免费服务的本地文件不可靠。
3. 图片一定要压缩，不然免费额度很快用完。
4. 密码和密钥不要发给别人，不要写进前端页面。

---

## 2. 本地运行

### 第一步：安装 Node.js

去 Node.js 官网下载 LTS 版本并安装。

安装好后，打开命令行，输入：

```bash
node -v
npm -v
```

能看到版本号就说明装好了。

### 第二步：解压项目

把这个压缩包解压，例如得到：

```text
argon-like-app-hyperos
```

### 第三步：安装依赖

进入项目目录，在空白处右键打开终端，或者用命令进入：

```bash
cd argon-like-app-hyperos
npm install
```

### 第四步：启动网站

```bash
npm start
```

看到类似下面的内容就成功了：

```text
✅ 网站已运行：http://localhost:3000
🔒 后台隐藏入口：http://localhost:3000/你设置的隐藏路径
```

浏览器打开：

```text
http://localhost:3000
```

后台不再公开显示为 `/admin.html`，而是改成你自定义的隐藏地址。

比如你在 `.env` 里这样写：

```env
ADMIN_PATH=/my-hidden-panel-2026
```

那么后台地址就是：

```text
http://localhost:3000/my-hidden-panel-2026
```

本地默认后台：

```text
账号：admin
密码：admin123456
```

本地图片如果没有配置 Supabase 或 R2，会上传到：

```text
public/uploads
```

注意：本地测试可以这样，正式部署不推荐这样保存图片。

---

## 3. 修改后台密码

复制配置文件：

```bash
cp .env.example .env
```

Windows 如果不能用上面命令，就手动复制 `.env.example`，改名为 `.env`。

打开 `.env`，至少改这三项：

```env
JWT_SECRET=这里随便打很长一串字符，越乱越好
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码
```

然后重新启动：

```bash
npm start
```


还建议加上这一项，用来隐藏后台入口：

```env
ADMIN_PATH=/my-hidden-panel-2026
```

说明：

- 这不是替代密码，而是“隐藏入口 + 密码登录”双保险。
- `/admin` 和 `/admin.html` 默认会返回 404。
- 你可以把 `my-hidden-panel-2026` 换成更长、更难猜的字符串。

---

## 4. Supabase 数据库设置

这一步是为了让文章、评论、网站设置保存到云端数据库，不会因为 Render 重启而丢失。

### 第一步：创建 Supabase 项目

1. 打开 Supabase 官网。
2. 注册 / 登录。
3. 点 New project。
4. Organization 随便选。
5. Project name 可以填：

```text
argon-blog
```

6. Database Password 自己设置一个强密码，记下来。
7. Region 选离你用户近的地方，例如新加坡、日本、美国西部都可以。
8. 创建项目。

### 第二步：拿数据库连接字符串

1. 进入 Supabase 项目。
2. 找到 Connect。
3. 选择 PostgreSQL / Connection string。
4. 推荐使用 Session pooler 或 Transaction pooler 的连接串。
5. 复制连接串，大概长这样：

```text
postgresql://postgres.xxxxx:你的密码@aws-0-xxx.pooler.supabase.com:6543/postgres
```

注意：把里面的 `[YOUR-PASSWORD]` 换成你刚才设置的数据库密码。

### 第三步：本地测试 Supabase 数据库

在 `.env` 里填：

```env
DATABASE_URL=你的 Supabase PostgreSQL 连接字符串
PGSSL=true
```

然后运行：

```bash
npm start
```

项目会自动建表，不需要你手动写 SQL。

---

## 5. 图片上传方案 A：Supabase Storage，最适合小白

这个方案最简单，推荐你一开始先用它。

### 第一步：创建图片桶

1. 进入 Supabase 项目。
2. 左侧找到 Storage。
3. 点 New bucket。
4. Bucket name 填：

```text
blog-images
```

5. 勾选 Public bucket。
6. 创建。

必须是 Public bucket，否则前台用户可能看不到图片。

### 第二步：拿 Supabase URL 和 service role key

1. 进入 Project Settings。
2. 找到 API。
3. 复制 Project URL。
4. 复制 service_role key。

注意：service_role key 权限很高，只能放在 Render 环境变量或本地 `.env`，不要写进 HTML、JS 前端文件，也不要截图发给别人。

### 第三步：配置 `.env`

```env
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role key
SUPABASE_BUCKET=blog-images
MAX_UPLOAD_MB=5
```

然后重启：

```bash
npm start
```

进入后台，上传封面图或正文图测试。

---

## 6. 图片上传方案 B：Cloudflare R2，图片多时性价比最高

如果你要放很多鞋图、产品图、作品图，建议后期切到这个方案。

### 第一步：开通 R2

1. 打开 Cloudflare。
2. 登录账号。
3. 左侧找到 R2 Object Storage。
4. 按提示开通 R2。
5. 创建 Bucket，名字填：

```text
blog-images
```

### 第二步：创建 R2 API Token

1. 进入 R2。
2. 找到 Manage API Tokens。
3. Create API token。
4. 权限选择 Object Read & Write。
5. 限制到你刚才创建的 `blog-images` bucket。
6. 创建后复制：

```text
Access Key ID
Secret Access Key
Account ID
```

Secret Access Key 只显示一次，一定要保存好。

### 第三步：设置公开访问地址

你有两种方式：

#### 方式 1：使用 r2.dev 临时公共地址

Cloudflare 后台可以启用公共开发域名，类似：

```text
https://pub-xxxxx.r2.dev
```

适合测试。

#### 方式 2：绑定自己的图片域名，推荐正式用

例如你买了：

```text
example.com
```

可以给图片设置：

```text
https://img.example.com
```

正式网站更建议这样。

### 第四步：配置 `.env`

```env
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=你的 Cloudflare Account ID
R2_ACCESS_KEY_ID=你的 R2 Access Key ID
R2_SECRET_ACCESS_KEY=你的 R2 Secret Access Key
R2_BUCKET=blog-images
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev 或 https://img.example.com
MAX_UPLOAD_MB=5
```

重启后，后台上传图片就会进入 R2。

---

## 7. 上传文章和图片

登录后台：

```text
/admin.html
```

### 上传封面图

1. 找到文章编辑区。
2. 选择封面图。
3. 点“上传并设为封面”。
4. 成功后，封面图 URL 会自动填入。

### 上传正文图

1. 找到“上传正文图片”。
2. 选择图片。
3. 点“上传并插入正文”。
4. 正文会自动插入：

```markdown
![文章图片](图片链接)
```

### 上传头像

1. 到站点设置。
2. 选择头像图片。
3. 点“上传并设为头像”。
4. 保存设置。

---

## 8. 图片怎么压缩最划算

你的网站图片建议这样处理：

```text
文章封面：宽度 1200～1600px，300KB～800KB
正文图片：宽度 1000～1400px，200KB～600KB
头像：300px～600px，100KB～300KB
格式：优先 webp，其次 jpg
```

如果你直接上传手机原图，一张可能 3MB～10MB，免费额度会很快没。

推荐流程：

```text
手机 / 相机原图
↓
压缩成 webp 或 jpg
↓
再上传后台
```

---

## 9. 上传到 GitHub

### 第一步：新建 GitHub 仓库

1. 登录 GitHub。
2. 点 New repository。
3. Repository name 填：

```text
argon-blog
```

4. 选择 Public 或 Private 都可以。
5. 创建。

### 第二步：上传代码

小白最简单方式：

1. 打开仓库页面。
2. 点 Add file。
3. 点 Upload files。
4. 把项目文件拖进去。
5. 不要上传 `.env` 文件。
6. 提交。

`.env` 里有密码和密钥，绝对不要上传。

---

## 10. 部署到 Render

### 第一步：新建 Web Service

1. 登录 Render。
2. 点 New。
3. 选择 Web Service。
4. 连接 GitHub。
5. 选择你的 `argon-blog` 仓库。

### 第二步：填写部署配置

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Plan: Free
```

### 第三步：添加环境变量

在 Render 的 Environment 里添加：

```env
NODE_VERSION=20
NODE_ENV=production
JWT_SECRET=一串很长很乱的字符
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的后台强密码
DATABASE_URL=你的 Supabase PostgreSQL 连接字符串
PGSSL=true
MAX_UPLOAD_MB=5
```

如果用 Supabase Storage，再加：

```env
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role key
SUPABASE_BUCKET=blog-images
```

如果用 Cloudflare R2，再加：

```env
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=你的 Cloudflare Account ID
R2_ACCESS_KEY_ID=你的 R2 Access Key ID
R2_SECRET_ACCESS_KEY=你的 R2 Secret Access Key
R2_BUCKET=blog-images
R2_PUBLIC_URL=https://你的公开图片域名
```

注意：Supabase Storage 和 R2 二选一，不要同时启用。

### 第四步：部署

点 Deploy。

部署成功后，你会得到一个地址，例如：

```text
https://argon-blog.onrender.com
```

前台：

```text
https://argon-blog.onrender.com
```

后台：

```text
https://argon-blog.onrender.com/admin.html
```

---

## 11. 绑定自己的域名

假设你买了：

```text
example.com
```

### 第一步：Render 添加域名

1. 进入 Render 的 Web Service。
2. 找 Settings。
3. 找 Custom Domains。
4. 添加：

```text
www.example.com
```

Render 会告诉你要设置哪个 CNAME。

### 第二步：域名商添加解析

到你买域名的平台，找到 DNS 解析，添加：

```text
类型：CNAME
主机记录：www
记录值：Render 给你的地址
```

等待几分钟到几小时生效。

### 第三步：开启 HTTPS

Render 一般会自动给自定义域名配置 HTTPS 证书，不需要你单独买 SSL。

---

## 12. 后期什么时候该升级

### 还可以继续免费用的情况

```text
每天几十到几百访问
文章主要是文字
图片压缩后上传
网站偶尔慢一点可以接受
```

### 建议升级的情况

```text
网站经常有人访问
你不想要 Render 冷启动
图片超过免费额度
你要做正式商业站
你要大量产品图、相册、视频
```

升级顺序建议：

```text
第一步：先买域名
第二步：图片改用 Cloudflare R2
第三步：Render 升级最低付费实例，解决休眠
第四步：Supabase 升级 Pro，获得更高数据库和存储额度
```

---

## 13. 常见问题

### Q1：为什么不要把图片上传到 Render？

因为免费 Render 的本地文件系统不适合长期存图片。你后台上传后，短时间可能能看，但重新部署、重启后可能没了。

### Q2：我不会配置 R2，能不能先用 Supabase？

可以。你先用 Supabase Storage，等图片多了再换 R2。

### Q3：换 R2 会不会影响旧文章？

不会。旧文章里保存的是旧图片 URL，新文章可以用新图片 URL。只是后期如果你想统一搬家，需要批量替换文章里的图片链接。

### Q4：图片免费额度不够怎么办？

先检查有没有上传原图。很多时候压缩一下就能省 80% 以上空间。还不够再换 R2 或升级。

### Q5：后台密码忘了怎么办？

如果是本地 JSON，删除 `data/db.json` 会重置数据，不推荐。  
如果是 Supabase 数据库，可以在 Render 改 `ADMIN_PASSWORD` 后，新账号不会自动覆盖旧账号密码。简单做法是换一个 `ADMIN_USERNAME`，项目启动时会创建新管理员。

---

## 14. 文件结构

```text
src/server.js          后端入口
src/db.js              数据库逻辑，本地 JSON / PostgreSQL 自动切换
src/storage.js         图片上传逻辑，本地 / Supabase Storage / Cloudflare R2 自动切换
public/index.html      前台页面
public/admin.html      后台页面
public/css/style.css   样式
public/js/app.js       前台 JS
public/js/admin.js     后台 JS
.env.example           环境变量示例
render.yaml            Render 部署示例
```

---

## 15. 推荐你现在就用的配置

一开始别搞太复杂，直接用：

```text
Render + Supabase 数据库 + Supabase Storage + 自己买的域名
```

等你图片多了，再切：

```text
Render + Supabase 数据库 + Cloudflare R2 + 自己买的域名
```


---

## 补充：这次帮你改了什么

这次这个 HyperOS 风格版，我额外做了两件你刚才要求的事：

### 1）后台链接隐藏

以前的后台是：

```text
/admin.html
```

现在改成：

```text
你自己在 .env 里设置的 ADMIN_PATH
```

比如：

```env
ADMIN_PATH=/console-7f92x-jiaojie
```

那后台就是：

```text
https://你的域名/console-7f92x-jiaojie
```

并且：

- 前台导航不再显示“后台”按钮
- `/admin`、`/admin.html` 会直接返回 404
- 即使别人知道隐藏地址，仍然还要登录

### 2）界面更像 HyperOS

我做了这些视觉优化：

- 更圆润的大圆角卡片
- 半透明毛玻璃效果
- 更柔和的阴影和层级
- 更轻的蓝紫色渐变
- 后台增加概览统计卡片
- 登录界面和后台界面都更简洁

如果你后面还想继续往“小米澎湃 OS”那个方向靠，我下一版还可以再加：

- 左侧图标导航栏
- 更像系统设置页的分组布局
- 更高级的动效
- 文章编辑器实时预览
- 仪表盘图表



---

## 新增：自定义网站 Logo

现在后台已经支持两种方式设置 Logo：

1. 直接填 `Logo 图片 URL`
2. 在后台上传 Logo 图片后自动写入

建议：

- 用透明 PNG 或 SVG
- 尺寸尽量接近正方形
- 文件不要过大，建议控制在 100KB～300KB

如果你不上传 Logo，网站会自动显示默认的渐变图形 Logo。



---

## 新增：HyperOS Motion V3 动效升级

这版继续加强了界面动效，不只是静态玻璃卡片：

- 顶部滚动进度条
- “超级岛”式状态提示
- 鼠标跟随光斑
- Hero 区域 3D 视差
- 手机模型和浮层卡片漂浮动画
- 文章卡片鼠标倾斜高光
- 页面切换模糊淡入淡出
- 滚动进入视野时的渐现动画
- 背景光晕缓慢漂浮

如果你觉得动效太多，可以在 CSS 里搜索 `HyperOS Motion V3 Upgrade`，把不想要的动画删掉或调慢。


---

## HyperOS Motion V4：参考 RyuChan 的体验优化

这版在不直接复制 RyuChan 源码的前提下，借鉴了它的几个产品思路：

1. 浏览器里写文章：后台继续保留在线发布、编辑、上传图片。
2. Markdown 预览：编辑正文时，下面会实时显示预览效果。
3. 可视化配置：Logo、头像、标题、Banner 文案都可以在后台改。
4. 页面动效：保留滚动渐现、页面切换、鼠标光斑、超级岛提示。
5. 鼠标倾斜卡片：顶部悬浮卡片、文章卡片会跟随鼠标位置倾斜，鼠标离开自动回正。

### 卡片倾斜动效怎么改强弱

在 `public/index.html` 里可以看到类似：

```html
<div class="floating-panel-card tilt-card" data-tilt-strength="18">
```

数值越大，卡片倾斜越明显。建议范围：

```text
10：轻微
18：明显
25：很强，不建议再高
```

如果你想让某个卡片也有这个效果，只要加上：

```html
class="tilt-card"
```

需要更强，就加：

```html
data-tilt-strength="18"
```


---

## HyperOS Motion V4.1：Hero 大卡片倾斜

这版新增了整块首页 Hero 主视觉倾斜效果：

- 鼠标移动到大卡片左边，整块卡片向左侧倾斜
- 鼠标移动到右边，整块卡片向右侧倾斜
- 鼠标移动到上方或下方，也会产生对应的 3D 倾斜
- 鼠标离开后，自动回到初始状态

如果你觉得倾斜太强或太弱，打开 `public/index.html`，找到：

```html
<section class="hero hero-hyper hero-tilt-card tilt-card" id="heroSection" data-tilt-strength="7" data-tilt-move="7">
```

调整：

```text
data-tilt-strength：控制旋转角度，建议 4～10
data-tilt-move：控制跟随位移，建议 4～10
```


---

## HyperOS Motion V5：RyuChan 融合版新增内容

这版参考了你上传的 RyuChan 主题，但没有直接复制它的代码。主要借鉴了它比较优秀的思路：

1. 在线写作体验：后台继续保留 Markdown 实时预览。
2. 可视化配置：站点标题、Logo、主题、排版、首页卡片都能在后台改。
3. 主题选择器：前台新增颜色主题切换按钮，后台可以设置默认主题。
4. 卡片化展示：把首页功能卡片做成可编辑模块。
5. 后台配置体验：不用手动改 JSON 文件，直接在表单里新增、删除、上移、下移卡片。

### 1. 颜色主题切换模块

前台导航栏里新增了一个 🎨 按钮，访客可以自己切换配色。

后台路径进入后，找到：

```text
站点设置 → 颜色主题切换模块
```

可以选择默认主题：

```text
Hyper Blue
Sakura
Matcha
Sunset
Aurora
Night
```

保存后，前台默认会使用你选择的主题。访客自己点前台 🎨 切换后，会保存在浏览器本地。

### 2. 自由排版模块

后台找到：

```text
站点设置 → 自由排版模块
```

目前支持：

```text
经典博客：左侧信息栏 + 右侧文章流
杂志卡片：文章卡片更像作品集
沉浸阅读：隐藏侧栏，突出内容
紧凑信息：更适合文章多的网站
```

不用改代码，保存后刷新前台即可看到效果。

### 3. 首页卡片内容后台可编辑

后台找到：

```text
站点设置 → 首页卡片内容
```

每张卡片可以编辑：

```text
小标签
标题
图标
链接
描述
```

这些卡片会显示在：

```text
首页 Hero 右侧悬浮卡片
首页下方功能卡片区
```

卡片支持新增、删除、上移、下移。保存站点设置后刷新前台生效。

### 4. 建议卡片写法

不要把卡片写得太长，推荐这样：

```text
小标签：Markdown
标题：实时预览
图标：✍️
描述：后台写作时边写边看，适合快速发布文章。
链接：可不填，或者填 #/archive
```

### 5. 这版对应的核心文件

```text
public/index.html        前台结构
public/js/app.js         前台主题、排版、卡片渲染和动效
public/css/style.css     主题、布局、卡片样式
private/admin.html       后台配置表单
public/js/admin.js       后台卡片编辑逻辑
src/db.js                新增设置项默认值和保存白名单
```

---

## V5.1 修复说明：前台空白与后台排版重整

这一版主要修复两个问题：

1. **前台 Hero 大卡片只显示背景、不显示文字和卡片**
   - 原因是颜色主题模块缺少前端主题预设常量，导致 JS 中断；同时部分 CSS 动画初始状态会让内容保持透明。
   - 现在已经补全主题预设，并把内容改成即使 JS 出错也不会永久隐藏。

2. **后台布局出现大块空白、编辑区和设置区错位**
   - 原因是编辑卡片使用了 sticky 定位，页面滚动到设置区时会和下方模块产生视觉重叠。
   - 现在后台改成固定的规整布局：
     - 顶部：内容控制台概览
     - 中部：文章管理 + 文章编辑双栏
     - 下方：站点设置独立全宽区域
   - 站点设置里的主题切换、自由排版、首页卡片编辑都重新做了分组，阅读和操作更清楚。

### 现在后台建议这样用

先编辑文章，再往下滚动到站点设置。

站点设置分为：

```text
基础设置：网站标题、Logo、Hero 文案、作者信息
颜色主题切换模块：设置默认颜色主题
自由排版模块：选择首页布局
首页卡片内容：编辑 Hero 右侧卡片和首页功能卡片
```

### 前台主题按钮

前台右上角 🎨 是颜色主题选择器，访客可以自行切换：

```text
Hyper Blue / Sakura / Matcha / Sunset / Aurora / Night
```

### 自由排版模块

后台可以选择：

```text
经典博客
杂志卡片
沉浸阅读
紧凑信息
```

保存设置后刷新前台即可看到变化。

---

## HyperOS + RyuChan Plus V6：新增功能

这版继续参考 RyuChan 的优秀体验，但没有复制它的代码，而是把这些功能缝合到当前独立前后端项目里：

### 1. 超级岛公告模块

后台位置：

```text
站点设置 → 超级岛公告模块
```

保存后，前台加载页面时会以顶部“超级岛”形式弹出公告。适合放店铺通知、更新提醒、活动提示。

### 2. 快捷导航模块

后台位置：

```text
站点设置 → 快捷导航模块
```

可新增、删除、上移、下移导航项。前台显示在侧栏，适合放：

```text
关于我
作品集
校园鞋店
联系方式
建站记录
```

### 3. 项目展示模块

后台位置：

```text
站点设置 → 项目展示模块
```

参考 RyuChan 的 ProjectCard / Showcase 思路，适合放作品集、鞋类设计项目、店铺活动、视频专题。

每个项目可以设置：

```text
标题
说明
图片 URL
标签
跳转链接
```

### 4. 友链 / 推荐模块

后台位置：

```text
站点设置 → 友链 / 推荐模块
```

适合放朋友网站、工具链接、社交主页、资源入口。

### 5. 音乐播放器模块

后台位置：

```text
站点设置 → 音乐播放器模块
```

填写可公开访问的 mp3 / 音频 URL 后，前台右下角会出现音乐播放器。

注意：

```text
不要填本地电脑路径，比如 C:\\xxx\\music.mp3
要填可以通过浏览器直接打开的链接
```

### 6. 文章版权说明

后台位置：

```text
站点设置 → 文章版权说明
```

保存后会显示在文章详情页底部。

### 7. 文章排序条

首页文章区新增排序：

```text
最新
热门
标题
```

这个是前端即时排序，不需要刷新页面。

### 8. 上一篇 / 下一篇

文章详情页底部新增上一篇、下一篇导航，阅读体验更完整。


---

## V7 新增：文章 / 页面分离 + 实时前台预览

这版后台把“文章”和“页面”拆开了，两个不是同一个东西。

### 文章是什么

文章适合写博客、教程、店铺动态、作品记录。

文章会出现在：

```text
首页文章列表
分类页
标签页
归档页
文章详情页
```

文章会有：

```text
分类
标签
摘要
封面
评论区
上一篇 / 下一篇
版权说明
```

后台路径：

```text
内容控制台 → 文章
```

写文章时，右下方有 **文章前台实时预览**。它模拟的是前台文章详情页效果，不是普通 Markdown 预览。

### 页面是什么

页面适合做固定内容，例如：

```text
关于我
联系我们
店铺介绍
作品集目录
服务说明
隐私说明
```

页面不会进入首页文章列表，也不会进入分类、标签、归档。

页面会有：

```text
页面标题
页面摘要
页面封面
页面正文
页面模板
排序
```

页面没有：

```text
分类
标签
评论区
上一篇 / 下一篇
```

后台路径：

```text
内容控制台 → 页面
```

写页面时，右下方有 **页面前台实时预览**。它模拟的是独立页面效果，和文章预览是分开的。

### 页面访问地址

假设你新建页面时 slug 填：

```text
about
```

那前台访问地址是：

```text
https://你的域名/#/page/about
```

本地访问则是：

```text
http://localhost:3000/#/page/about
```

### 建议用法

```text
文章：发日常、教程、作品动态、店铺更新
页面：做关于我、联系页、店铺介绍、作品集入口
```

如果你想把页面放到侧栏快捷导航里，可以到：

```text
站点设置 → 快捷导航模块
```

新增一个导航，链接填：

```text
#/page/about
```


---

## V8 新增：左右实时预览 + 自定义 clean URL + 导航可选文章/页面

这版按你的要求重点改了 3 件事。

### 1）后台写文章 / 页面变成左右预览

进入后台后：

```text
文章 → 左边写文章，右边实时显示前台文章详情页效果
页面 → 左边写页面，右边实时显示独立页面效果
```

文章预览会显示：

```text
封面、标题、分类、标签、正文、版权说明、评论区结构
```

页面预览会显示：

```text
封面、标题、摘要、正文
```

页面不会显示文章分类、标签和评论区。

### 2）文章和页面都支持自定义 clean URL

以前文章地址是：

```text
https://你的域名/#/post/xxx
```

现在改成：

```text
https://你的域名/xxx
```

后台写文章或页面时，填写“自定义链接 yy”，例如：

```text
shoe-store
```

那么前台地址就是：

```text
https://你的域名/shoe-store
```

页面也是一样，例如页面 slug 填：

```text
about
```

前台地址就是：

```text
https://你的域名/about
```

注意：尽量用英文、数字、短横线，例如：

```text
about
my-store
shoe-design-portfolio
contact
```

不建议把下面这些作为 slug，因为它们是系统保留路径：

```text
archive
category
tag
search
api
admin
```

### 3）页眉导航栏和快捷导航都可以在后台编辑

后台进入：

```text
站点设置 → 页眉导航栏模块
```

这里可以编辑前台顶部导航栏。你可以：

```text
新增导航
删除导航
上移 / 下移排序
直接选择已有文章 / 页面
手动填写自定义链接
```

后台进入：

```text
站点设置 → 快捷导航模块
```

这里控制前台侧栏的快捷导航，也同样支持选择文章 / 页面。

---

---

## V9 新增：全卡片倾斜 + 第三方视频嵌入

### 1. 所有卡片都有倾斜效果

现在前台和后台的大部分卡片都接入了鼠标倾斜动效：

```text
Hero 大卡片
文章卡片
侧栏卡片
项目卡片
友链卡片
快捷导航卡片
后台概览卡片
后台文章 / 页面列表卡片
后台设置模块卡片
```

鼠标移到卡片哪里，卡片就会往对应方向轻微倾斜；鼠标离开会自动回正。

如果你觉得太明显，可以打开：

```text
public/js/app.js
public/js/admin.js
```

搜索：

```text
tiltStrength
```

把数字调小即可。

### 2. 文章 / 页面支持第三方视频嵌入

建议不要把视频上传到自己的网站服务器，视频文件太大，会很快耗尽免费存储和流量。

推荐做法是：

```text
视频上传到哔哩哔哩 / 抖音 / 西瓜视频 / YouTube 等平台
↓
复制外部播放器链接或 iframe
↓
粘贴到文章 / 页面正文
↓
网站只负责展示，不负责存储视频
```

推荐写法：

```text
[video src="https://player.bilibili.com/player.html?bvid=BVxxxx" title="视频标题" ratio="16:9"]
```

也支持这种写法：

```text
::video https://player.bilibili.com/player.html?bvid=BVxxxx title="视频标题" ratio="16:9"
```

也可以直接粘贴 iframe：

```html
<iframe src="https://player.bilibili.com/player.html?bvid=BVxxxx"></iframe>
```

### 3. 后台新增视频 CSS 设置

后台进入：

```text
站点设置 → 第三方视频嵌入模块
```

可以编辑：

```text
视频模块 CSS
全站自定义 CSS
```

比如你想让视频圆角更大，可以写：

```css
.video-frame {
  border-radius: 28px;
}
```

比如你想让视频上下间距更大，可以写：

```css
.video-embed {
  margin: 36px 0;
}
```

### 4. 后台提供插入视频模板按钮

写文章和写页面时，都有：

```text
插入外部视频模板
```

点击后会自动插入一段视频短代码，你只需要把里面的链接换成自己的外部播放器链接。

---

## V9.1 修改：后台稳定 + 主题色非线性渐变切换

这版做了两点调整：

1. 后台不再启用卡片倾斜效果。
   - 后台主要是写文章、改页面、调设置，卡片晃动会影响操作稳定性。
   - 前台仍然保留 Hero、文章、侧栏、项目、友链、快捷导航等卡片倾斜效果。

2. 颜色主题切换加入随机方向的非线性动画。
   - 每次切换主题时，会随机从以下方向之一完成颜色过渡：
     - 自上而下
     - 自下而上
     - 从左往右
     - 从右往左
   - 动画使用缓动曲线，不是硬切颜色，视觉会更接近系统级主题过渡。

---

## V9.2：电影感主题切换动画

这版重做了主题切换效果，不再是简单换色。

每次点击前台导航栏的 🎨 颜色主题时，会随机使用一种方向：

```text
自上而下
自下而上
从左往右
从右往左
```

动画效果包括：

```text
全屏主题覆盖层
方向性渐变擦除
流体光斑
亮带扫光
粒子闪烁
页面轻微景深收缩
主题落地后的弹性回弹
```

如果你觉得动画太强，可以打开：

```text
public/js/app.js
```

搜索：

```text
playThemeTransition
```

把 duration 的数值调小，例如 860 改成 600，820 改成 500。

如果你想改视觉效果，可以打开：

```text
public/css/style.css
```

搜索：

```text
V9.2: cinematic theme transition
```

这里就是主题切换动画的 CSS。

---

## V9.3 修复：主题切换不卡顿版

上一版的电影感主题切换使用了全屏覆盖层、粒子、扫光和页面缩放，视觉很强，但会带来明显重绘，部分电脑会卡。

这一版改成轻量方案：

- 不再创建全屏覆盖层
- 不再使用粒子、扫光、页面缩放
- 只切换 `body` 背景颜色和背景位置
- 每次切换仍然随机方向：自上而下、自下而上、从左往右、从右往左
- 使用非线性缓动曲线，让背景过渡更顺滑

如果你想调快或调慢，打开：

```text
public/css/style.css
```

搜索：

```css
body.theme-bg-flow
```

把 `animation-duration: .72s;` 改成：

```css
animation-duration: .5s;   /* 更快 */
animation-duration: 1s;    /* 更慢 */
```

---

## V10 新增：文章 / 页面模块化编辑器

后台写文章和写页面时，正文不再只有一个大文本框，而是改成模块化结构：

```text
第一文字模块
第二图片模块
第三视频模块
第四文字模块
```

### 文章模块

进入后台：

```text
内容控制台 → 文章
```

可以添加：

```text
文字模块：写普通正文，支持 Markdown
图片模块：填写图片 URL / 说明 / 注释
视频模块：填写第三方视频 iframe 链接 / 标题 / 比例 / CSS 类名
```

右侧会实时显示接近前台文章详情页的效果。

### 页面模块

进入后台：

```text
内容控制台 → 页面
```

页面同样支持文字、图片、视频模块，但页面预览不会显示文章分类、标签、评论区，和文章是分开的。

### 图片插入到中间

先点击想插入位置前面的模块，让它变成选中状态，然后上传图片。图片会插入到这个模块后面。

### 视频不占服务器空间

视频模块建议填写第三方平台 iframe 播放链接，例如：

```text
https://player.bilibili.com/player.html?bvid=BVxxxx
```

网站只嵌入展示，不保存视频文件。

### 视频 CSS 类名

视频模块里可以填写 CSS 类名，例如：

```text
douyin-video
```

然后在后台：

```text
站点设置 → 第三方视频嵌入模块 → 视频模块 CSS
```

写对应 CSS，例如：

```css
.douyin-video .video-frame {
  border-radius: 32px;
}
```

---

## V10.1 新增：后台分类 / 标签双向同步

这一版把分类和标签做成了后台可管理的数据，不再只靠文章里随便输入。

### 1）在哪里管理分类和标签

进入后台：

```text
站点设置 → 分类 / 标签管理
```

这里可以：

```text
新增分类
编辑分类
删除分类
新增标签
编辑标签
删除标签
分类 / 标签列表切换查看
```

### 2）文章里怎么添加分类

在文章编辑器里，分类输入框要这样写：

```text
@教程
```

然后按回车。

系统会自动把 `@` 去掉，真正保存为：

```text
教程
```

### 3）文章里怎么添加标签

标签输入框要这样写：

```text
#部署
```

然后按回车。

标签会保留 `#`，真正保存为：

```text
#部署
```

### 4）双向同步逻辑

- 在文章里新增的 `@分类`、`#标签`，会同步到站点设置里的分类 / 标签列表。
- 在站点设置里新增的分类 / 标签，后台文章编辑器也能继续使用。
- 后端会统一清洗和去重，避免同一个分类或标签同时同步两次。

### 5）注意

文章目前只有一个分类，但可以有多个标签。

推荐写法：

```text
分类：@教程
标签：#部署 #WordPress #鞋类设计
```


---

## V10.3：代码精简与后台体验优化

这一版主要做的是“整理和减负”，不是单纯堆功能。

### 已优化

```text
1. 模块编辑器改为事件委托，减少重复绑定事件
2. 文章 / 页面实时预览加入防抖，输入更顺滑
3. 模块新增“折叠”功能，长文章编辑不再一屏拉很长
4. 模块新增“复制”功能，重复模块不用重新建
5. 新增未保存离开提醒，避免误刷新丢内容
6. 插入模块动画改为轻量 transform，不做高成本重绘
```

### 后续建议

项目里我额外放了一份：

```text
docs/优化建议.md
```

里面写了后续继续优化的方向，例如拆分 JS 文件、把模块数据从 Markdown 升级成 JSON、图片自动压缩、视频平台模板等。

---

## V10.5 新增：站点设置主页实时预览 + 收尾优化

这版在后台 `站点设置` 里增加了右侧主页实时预览。

现在你修改这些内容时，右侧都会同步变化：

- 网站标题
- Logo 文字
- Logo 图片
- 页眉导航
- Banner 大标题
- Banner 说明
- 首页卡片
- 作者头像和简介
- 分类 / 标签
- 首页自由排版
- 颜色主题

后台排版现在是：

```text
左侧：站点设置表单
右侧：主页实时预览
```

小屏幕会自动变成上下布局，避免表单太窄。

另外新增了一份优化清单：

```text
docs/遗漏与优化清单.md
```

里面记录了后续可以继续做的优化方向。

---

## V10.6 新增：站点设置同步修复 + 模块显示开关

这版重点修复了“后台设置保存后，前台有些模块不同步”的问题。

### 修复内容

- 前台 `/api/site` 请求禁用缓存，刷新页面会拿到最新站点设置。
- 后端、后台表单、前台渲染使用同一套设置字段。
- 主题默认色现在以后台保存的 `theme_preset` 为准，避免浏览器本地缓存导致管理员误以为没有同步。
- 站点设置保存后会重新读取后端返回结果，并刷新后台右侧主页预览。

### 新增：模块显示开关

后台进入：

```text
站点设置 → 模块显示开关
```

可以控制这些前台模块是否显示：

```text
页眉导航栏
前台主题切换按钮
首页 Hero 首屏
Hero 右侧卡片
首页功能卡片区
项目展示模块
友链 / 推荐模块
侧栏作者卡片
侧栏分类
侧栏标签
侧栏快捷导航
音乐播放器
超级岛公告
页脚
文章评论区
文章版权说明
上一篇 / 下一篇
```

关闭模块后，后台数据不会删除，只是不在前台展示；之后重新打开，原来的内容还在。

### 如果你保存后前台还是旧效果

请先按：

```text
Ctrl + F5
```

如果仍然不变，检查是否部署平台还在跑旧版本，或者 Render 是否需要重新部署。

---

## V10.9 最终版提醒

这版已经把以下容易出问题的地方做了收尾修复：

- 手机模板的分类、标签、快捷导航、作者卡片会跟随后台模块开关显示 / 隐藏。
- 文章和页面的自定义链接会互相避让，不会出现同一个链接同时被文章和页面占用。
- `/api`、`/archive`、`/category`、`/tag`、`/search`、`/uploads` 等系统路径不会被文章 / 页面占用。
- 后台新增“系统检查”页，可以检查 Supabase、数据库、上传配置是否存在。
- 评论验证码错误现在按正常表单错误处理，并加入了简单评论频率限制。
- Render 配置已改成 pnpm 构建，避免 npm 在 Render 上偶发 `Exit handler never called`。

Render 继续使用：

```bash
Build Command:
npm install -g pnpm@9.12.3 && pnpm install --no-frozen-lockfile
```

```bash
Start Command:
node src/server.js
```

如果你之前仓库里还有 `package-lock.json`，建议在 GitHub 里删除它，避免以后误用 `npm ci`。
