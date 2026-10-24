# Steam 美化工具

**中文** | [English](README.en.md) | [日本語](README.ja.md)

**https://kisukri.github.io/steam-cut/**

纯前端的 Steam 个人资料展柜素材工具，所有处理都在浏览器本地完成

## 能做什么

- 把视频 / GIF / 图片切成创意工坊（5 栏）、艺术作品 / 截图（2 栏）、精选艺术作品（1 栏）需要的 GIF
- 把图片或音乐封面做成会转的唱片 / CD，用作指南图标
- 根据音乐生成「播放器」样式的指南标题和描述
- 给出每种展柜的上传控制台代码

## 技术栈

| 部分 | 用的东西 |
|---|---|
| 页面 | 原生 HTML / CSS / JavaScript（ES 模块），无框架、无构建 |
| 画面处理 | Canvas 2D、`<video>` / `<img>` 解码 |
| GIF 解码 | [gifuct-js](https://github.com/matt-way/gifuct-js) |
| GIF 编码 | [gifenc](https://github.com/mattdesl/gifenc)，在 Web Worker 里跑 |
| 打包下载 | [JSZip](https://github.com/Stuk/jszip)，点下载时才加载 |
| 多语言 | 每种语言一个模块，`import()` 按需加载 |
| 设置保存 | localStorage |
| 部署 | GitHub Pages（静态文件） |

## 原理

- **切图**：按 Steam 实际显示宽度把裁剪区域分成几栏，栏间缝隙对应的像素直接丢掉，拼起来不会错位
- **截帧**：视频用 `<video>` 逐帧 seek 后画到 Canvas；GIF 用 gifuct-js 解出每帧再合成
- **调色板**：每帧先把整条画面一起量化成一套 256 色调色板，再切给各栏，保证接缝处颜色一致；帧以 1 字节/像素的索引存储，内存约为 RGBA 的 1/4；静态图做旋转唱片时所有帧共用一套调色板，透明区域每帧完全一致，避免闪烁
- **压到上限**（展柜 5MB，指南封面 2MB）：先估算单帧大小，超出就均匀抽帧，同时把延时加长，总时长不变；GIF 延时单位是 1/100 秒，舍入误差会累计补回去。旋转唱片（静态图）不抽帧，而是重新渲染更少、等间隔的帧，转得更匀
- **Hex 修改**：把 GIF 最后一个字节 `0x3B` 改成 `0x21`，Steam 就不会重新压缩
- **上传代码**：在 Steam 上传页的控制台里用 `$J` 改隐藏表单字段（比如把 `image_width` 设为 1000、`image_height` 设为 1），再读一遍字段确认是否生效
- **旋转唱片**：Canvas 每帧旋转封面，再画上固定不动的反光；圆外和中间的孔做成透明（只给不透明像素做量化，留一个索引专门表示透明）
- **音乐封面**：直接解析文件字节，mp3 读 ID3v2 的 APIC，flac 读 PICTURE 块，m4a 读 `covr` atom，顺便取出歌名和歌手
- **播放器文字**：用 `─` 和圆点拼进度条，按当前时间算圆点位置；Steam 展柜会把描述里的换行变成空格，所以整段写成一行，靠宽度折行

## 本地运行

ES 模块和 Web Worker 需要通过 HTTP 访问，不能直接双击打开：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 目录

```
index.html / faq.html  页面
css/style.css          样式
js/app.js              入口
js/source.js           读取文件
js/media.js            视频 / GIF / 图片解码
js/cover.js            音乐封面和标签解析
js/stage.js            裁剪框、撤销
js/preview.js          预览
js/export.js           截帧、抽帧
js/gif-worker.js       量化和编码（Worker）
js/hexify.js           Hex 修改
js/guide.js            旋转唱片绘制
js/player-text.js      播放器文字
js/codes.js            上传代码
js/layout.js           各展柜尺寸
js/i18n.js, js/lang/   多语言
js/prefs.js            设置保存
vendor/                gifenc、gifuct-js、JSZip（MIT）
```

## 参考与致谢

没有复制其他项目的代码，以下是参考过的资料：

- 尺寸与上传代码：[ayricky](https://github.com/ayricky/steam-workshop-splitter)、[james-ccg](https://github.com/james-ccg/steam-artwork-cropper)、[Fameboyq](https://github.com/Fameboyq/steam-artwork-cropper)、[Dxrmy](https://github.com/Dxrmy/steam-long-artwork-uploader)、[lannahirave](https://github.com/lannahirave/steam-artwork-simplifier)、[XTsat](https://github.com/XTsat/SteamGuide)、[sapic（steam.design）](https://github.com/sapic/sapic)
- 上传教程：Steam 指南 [748624905](https://steamcommunity.com/sharedfiles/filedetails/?id=748624905)、[1655670004](https://steamcommunity.com/sharedfiles/filedetails/?id=1655670004)、[1717371438](https://steamcommunity.com/sharedfiles/filedetails/?id=1717371438)、[1128250496](https://steamcommunity.com/sharedfiles/filedetails/?id=1128250496)、[1672930440](https://steamcommunity.com/sharedfiles/filedetails/?id=1672930440)，[博客园](https://www.cnblogs.com/wayne-tao/p/12128444.html)，[知乎](https://zhuanlan.zhihu.com/p/151876875)
- 唱片和播放器文字的灵感：[知乎](https://zhuanlan.zhihu.com/p/661352634)、[3楼猫](https://game.3loumao.org/168943064)
- 预览样式：Steam profilev2.css（[SteamTracking](https://github.com/SteamTracking/SteamTracking)）、公开的个人资料页（[AnalisisRedes](https://github.com/PabloNietoLopez/AnalisisRedes)）
- 第三方库：[gifenc](https://github.com/mattdesl/gifenc)、[gifuct-js](https://github.com/matt-way/gifuct-js)、[JSZip](https://github.com/Stuk/jszip)

© 2026 キスクリ · [MIT](LICENSE) · 社区公益项目，与 Valve / Steam 无关
