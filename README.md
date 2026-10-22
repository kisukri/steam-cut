# Steam 展柜切图

**中文** | [English](README.en.md) | [日本語](README.ja.md)

把视频、GIF、图片切成 Steam 个人资料展柜需要的文件，并给出上传用的控制台代码

**https://kisukri.github.io/steam-cut/**

## 支持的展柜

| 展柜 | 栏数 | 显示宽度 |
|---|---|---|
| 创意工坊 | 5 | 每栏 122.4px（缝隙 4px） |
| 艺术作品 / 截图 | 2 | 506px + 100px |
| 精选艺术作品 | 1 | 630px |

## 功能

- 输入：mp4 / webm / mov、GIF、png / jpg / webp
- 拖动框选画面、设置起止时间、预览在 Steam 上的效果
- 自动扣除栏间缝隙，拼接不错位
- 5 栏共用调色板，帧数和时长完全一致
- 最高 50 帧/秒（GIF 上限）
- 示例素材：没有文件也能先试一遍
- 比例快捷选项：横幅 / 方形 / 竖长
- 生成前预估文件大小，超过 5MB 会提前提示
- 按浏览器语言自动选择界面语言
- 超过 5MB 自动减帧（总时长不变）
- 自动 Hex 修改（GIF 末尾 0x3B → 0x21）
- 打包 zip 下载（附上传说明）
- 上传代码：每种展柜一条，执行后控制台显示 ✅ / ⚠️
- 空白标题代码（单独一条，也可以合并成一条）
- 日本語 / 中文 / English

所有处理都在浏览器本地完成，文件不会上传到服务器

## 上传代码

在 [Steam 上传页](https://steamcommunity.com/sharedfiles/edititem/767/3/)选好文件后，F12 → 控制台，粘贴后回车

| 展柜 | 代码 |
|---|---|
| 创意工坊 | `$J('[name=consumer_app_id]').val(480),$J('[name=file_type]').val(0),$J('[name=visibility]').val(0);` |
| 艺术作品 / 精选艺术作品 | `$J('#image_width').val(1000),$J('#image_height').val(1);` |
| 截图 | `$J('#image_width').val(1000),$J('#image_height').val(1),$J('[name=file_type]').val(5);` |
| 空白标题 | `$J('[name=title]').val('‎ ');` |

工具页面上的代码末尾还会多一句检查，告诉你是否生效

## 部署到 GitHub Pages

Settings → Pages → Source 选「Deploy from a branch」，分支 `main`，目录 `/ (root)`，保存

## 本地运行

页面用了 ES 模块和 Web Worker，需要本地服务器：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 目录

```
index.html          页面
faq.html            常见问题
css/style.css       样式
js/faq.js           常见问题页
js/app.js           界面逻辑
js/i18n.js          三语文案
js/codes.js         上传代码
js/layout.js        各展柜尺寸
js/media.js         视频 / GIF / 图片解码
js/export.js        截帧、编码、自动减帧
js/gif-worker.js    后台处理线程
js/hexify.js        Hex 修改
vendor/             gifenc、gifuct-js、JSZip（MIT）
```

## 参考

[ayricky/steam-workshop-splitter](https://github.com/ayricky/steam-workshop-splitter)、
[james-ccg/steam-artwork-cropper](https://github.com/james-ccg/steam-artwork-cropper)、
[Fameboyq/steam-artwork-cropper](https://github.com/Fameboyq/steam-artwork-cropper)、
[XTsat/SteamGuide](https://github.com/XTsat/SteamGuide)、
[lannahirave/steam-artwork-simplifier](https://github.com/lannahirave/steam-artwork-simplifier)、
[sapic（steam.design）](https://github.com/sapic/sapic)

© 2026 キスクリ · [MIT](LICENSE) · 本项目为社区公益项目，与 Valve / Steam 无关
