# Steam Profile Tools

[中文](README.md) | **English** | [日本語](README.ja.md)

**https://kisukri.github.io/steam-cut/**

A front-end-only tool for Steam profile showcase assets. Everything runs locally in the browser.

## What it does

- Slices video / GIF / images into GIFs for Workshop (5 slots), Artwork / Screenshot (2), and Featured Artwork (1)
- Turns an image or album cover into a spinning vinyl / CD for a guide icon
- Builds a "music player" style guide title and description from a song
- Gives the console upload code for each showcase

## Tech stack

| Part | Used |
|---|---|
| Page | Plain HTML / CSS / JavaScript (ES modules), no framework, no build |
| Image work | Canvas 2D, `<video>` / `<img>` decoding |
| GIF decode | [gifuct-js](https://github.com/matt-way/gifuct-js) |
| GIF encode | [gifenc](https://github.com/mattdesl/gifenc), in a Web Worker |
| Zip download | [JSZip](https://github.com/Stuk/jszip), loaded on click |
| i18n | One module per language, loaded with `import()` |
| Settings | localStorage |
| Hosting | GitHub Pages (static files) |

## How it works

- **Slicing**: the crop is split by Steam's real display widths; pixels that fall in the gaps are dropped so the slots line up
- **Frames**: video is seeked frame by frame with `<video>` and drawn to a Canvas. The source frame rate is measured first and every seek lands in the middle of a source frame, so the neighboring frame is never picked by mistake. A warning shows when the chosen rate doesn't divide the source rate evenly (20 fps from a 30 fps video stutters); GIF frames are decoded with gifuct-js and composited
- **Palette**: a dozen frames spread across the clip are sampled to build one 256-color palette, used for every frame and every slot, so colors match at the seams and don't flicker from frame to frame. Pixels that fall between two palette colors are dithered between them with a fixed 8×8 pattern, so soft gradients (blush, sky) don't turn into flat blocks. A pixel only switches to a neighboring color band if the change lasts a few frames, which filters out edge shimmer from video noise. Black-and-white clips get a plain gray ramp, so dark gradients don't band. Frames are kept as 1 byte/px indices, about 1/4 the memory of RGBA
- **Fitting the limit** (5MB showcases, 2MB guide images): each frame stores only the pixels that changed since the previous one, and unchanged areas cost almost nothing, so clips with still areas keep more frames. If it's still over, you choose: keep quality (capture again at a lower, even frame rate) or keep it smooth (fewer colors first, down to 32, then frame rate). A spinning disc is re-rendered with fewer, evenly spaced frames
- **Hex edit**: the GIF's last byte `0x3B` becomes `0x21`, so Steam doesn't recompress it
- **Upload codes**: in the Steam upload page console, `$J` sets hidden form fields (e.g. `image_width` 1000, `image_height` 1), then reads them back to confirm
- **Spinning disc**: each frame rotates the cover on a Canvas, then draws a fixed glare on top. Outside the circle and the center hole are transparent (only opaque pixels are quantized, one index is reserved for transparency)
- **Album cover**: file bytes are parsed directly: ID3v2 APIC for mp3, the PICTURE block for flac, the `covr` atom for m4a. Title and artist come along
- **Player text**: the bar is built from `─` plus a dot placed by the current time. Steam turns newlines in the description into spaces, so it's written as one line and wraps by width

## Run locally

ES modules and Web Workers need HTTP, so opening the file directly won't work:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Layout

```
index.html / faq.html  pages
css/style.css          styles
js/app.js              entry
js/source.js           file loading
js/media.js            video / GIF / image decoding
js/cover.js            album cover + tag parsing
js/stage.js            crop box, undo
js/preview.js          preview
js/export.js           frame capture, frame dropping
js/gif-worker.js       quantize + encode (Worker)
js/hexify.js           hex edit
js/guide.js            spinning disc drawing
js/player-text.js      player text
js/codes.js            upload codes
js/layout.js           showcase sizes
js/i18n.js, js/lang/   languages
js/prefs.js            settings
vendor/                gifenc, gifuct-js, JSZip (MIT)
```

## References and credits

No code was copied from other projects. Sources consulted:

- Sizes and upload codes: [ayricky](https://github.com/ayricky/steam-workshop-splitter), [james-ccg](https://github.com/james-ccg/steam-artwork-cropper), [Fameboyq](https://github.com/Fameboyq/steam-artwork-cropper), [Dxrmy](https://github.com/Dxrmy/steam-long-artwork-uploader), [lannahirave](https://github.com/lannahirave/steam-artwork-simplifier), [XTsat](https://github.com/XTsat/SteamGuide), [sapic (steam.design)](https://github.com/sapic/sapic)
- Upload guides: Steam guides [748624905](https://steamcommunity.com/sharedfiles/filedetails/?id=748624905), [1655670004](https://steamcommunity.com/sharedfiles/filedetails/?id=1655670004), [1717371438](https://steamcommunity.com/sharedfiles/filedetails/?id=1717371438), [1128250496](https://steamcommunity.com/sharedfiles/filedetails/?id=1128250496), [1672930440](https://steamcommunity.com/sharedfiles/filedetails/?id=1672930440), [cnblogs](https://www.cnblogs.com/wayne-tao/p/12128444.html), [Zhihu](https://zhuanlan.zhihu.com/p/151876875)
- Disc and player text idea: [Zhihu](https://zhuanlan.zhihu.com/p/661352634), [3loumao](https://game.3loumao.org/168943064)
- Preview styling: Steam profilev2.css ([SteamTracking](https://github.com/SteamTracking/SteamTracking)), public profile pages ([AnalisisRedes](https://github.com/PabloNietoLopez/AnalisisRedes))
- Libraries: [gifenc](https://github.com/mattdesl/gifenc), [gifuct-js](https://github.com/matt-way/gifuct-js), [JSZip](https://github.com/Stuk/jszip)

© 2026 キスクリ · [MIT](LICENSE) · Community project, not affiliated with Valve / Steam
