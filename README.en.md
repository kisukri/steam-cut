# Steam Showcase Splitter

[中文](README.md) | **English** | [日本語](README.ja.md)

Splits videos, GIFs and images into files for Steam profile showcases, and shows the console code to upload them

**https://kisukri.github.io/steam-cut/**

## Supported showcases

| Showcase | Pieces | Display width |
|---|---|---|
| Workshop | 5 | 122.4px each (4px gaps) |
| Artwork / Screenshot | 2 | 506px + 100px |
| Featured Artwork | 1 | 630px |

## Features

- Input: mp4 / webm / mov, GIF, png / jpg / webp
- Drag to select the area, set start and end times, preview how it looks on Steam
- Slot gaps are removed automatically so seams line up
- All 5 slots share one palette per frame, with identical frame counts and timing
- Up to 50 fps (the GIF limit)
- Built-in sample to try without your own file
- Shape presets: banner / square / tall
- File size estimated before generating, with an early 5MB warning
- Interface language follows your browser
- Frames are reduced automatically if a file exceeds 5MB (total duration unchanged)
- Hex fix applied automatically (GIF trailer 0x3B → 0x21)
- Download everything as a zip (with upload instructions)
- Upload codes: one per showcase, printing ✅ / ⚠️ in the console after running
- Blank title code (separate, or combined into one)
- 日本語 / 中文 / English

Everything runs in your browser; files are never uploaded to a server

## Upload codes

On the [Steam upload page](https://steamcommunity.com/sharedfiles/edititem/767/3/), choose your file, then press F12 → Console, paste and press Enter

| Showcase | Code |
|---|---|
| Workshop | `$J('[name=consumer_app_id]').val(480),$J('[name=file_type]').val(0),$J('[name=visibility]').val(0);` |
| Artwork / Featured Artwork | `$J('#image_width').val(1000),$J('#image_height').val(1);` |
| Screenshot | `$J('#image_width').val(1000),$J('#image_height').val(1),$J('[name=file_type]').val(5);` |
| Blank title | `$J('[name=title]').val('‎ ');` |

The codes in the tool also include a check that tells you whether they worked

## Deploy to GitHub Pages

Settings → Pages → Source: “Deploy from a branch”, branch `main`, folder `/ (root)`, then Save

## Run locally

The page uses ES modules and Web Workers, so it needs a local server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

```
index.html          page
faq.html            FAQ
css/style.css       styles
js/faq.js           FAQ page
js/app.js           UI logic
js/i18n.js          text in 3 languages
js/codes.js         upload codes
js/layout.js        showcase sizes
js/media.js         video / GIF / image decoding
js/export.js        frame capture, encoding, auto-reduce
js/gif-worker.js    background worker
js/hexify.js        hex fix
vendor/             gifenc, gifuct-js, JSZip (MIT)
```

## Credits

[ayricky/steam-workshop-splitter](https://github.com/ayricky/steam-workshop-splitter),
[james-ccg/steam-artwork-cropper](https://github.com/james-ccg/steam-artwork-cropper),
[Fameboyq/steam-artwork-cropper](https://github.com/Fameboyq/steam-artwork-cropper),
[XTsat/SteamGuide](https://github.com/XTsat/SteamGuide),
[lannahirave/steam-artwork-simplifier](https://github.com/lannahirave/steam-artwork-simplifier),
[sapic (steam.design)](https://github.com/sapic/sapic)

© 2026 キスクリ · [MIT](LICENSE) · A free community project, not affiliated with Valve / Steam
