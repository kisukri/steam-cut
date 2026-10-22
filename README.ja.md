# Steam ショーケース分割

[中文](README.md) | [English](README.en.md) | **日本語**

動画・GIF・画像を、Steam プロフィールのショーケース用ファイルに分割するツールです。アップロード用のコンソールコードも表示します

**https://kisukri.github.io/steam-cut/**

## 対応ショーケース

| ショーケース | 分割数 | 表示幅 |
|---|---|---|
| ワークショップ | 5 | 各 122.4px（隙間 4px） |
| アートワーク / スクリーンショット | 2 | 506px + 100px |
| 注目のアートワーク | 1 | 630px |

## 機能

- 入力：mp4 / webm / mov、GIF、png / jpg / webp
- 範囲をドラッグで選択、開始・終了時間を指定、Steam での表示をプレビュー
- 列の隙間を自動で除去し、つなぎ目がずれない
- 5 列で同じカラーパレットを使用、フレーム数と長さも完全に一致
- 最大 50 fps（GIF の上限）
- サンプル素材で手持ちのファイルなしでも試せる
- 形のプリセット：横長 / 正方形 / 縦長
- 生成前にファイルサイズを予測、5MB 超過を事前に表示
- ブラウザの言語に合わせて表示言語を自動選択
- 5MB を超えたら自動でフレーム削減（再生時間は変わらない）
- Hex 修正を自動で適用（GIF の末尾 0x3B → 0x21）
- zip でまとめてダウンロード（手順書付き）
- アップロード用コード：ショーケースごとに 1 つ。実行するとコンソールに ✅ / ⚠️ が表示される
- タイトルを空白にするコード（別コード、または 1 つにまとめることも可能）
- 日本語 / 中文 / English

ファイルはすべてブラウザ内で処理され、サーバーには送信されません

## アップロード用コード

[Steam アップロードページ](https://steamcommunity.com/sharedfiles/edititem/767/3/)でファイルを選んだあと、F12 → コンソールに貼り付けて Enter

| ショーケース | コード |
|---|---|
| ワークショップ | `$J('[name=consumer_app_id]').val(480),$J('[name=file_type]').val(0),$J('[name=visibility]').val(0);` |
| アートワーク / 注目のアートワーク | `$J('#image_width').val(1000),$J('#image_height').val(1);` |
| スクリーンショット | `$J('#image_width').val(1000),$J('#image_height').val(1),$J('[name=file_type]').val(5);` |
| タイトルを空白に | `$J('[name=title]').val('‎ ');` |

ツール上のコードには、成功したかを確認する一文が付いています

## GitHub Pages で公開

Settings → Pages → Source を「Deploy from a branch」、ブランチ `main`、フォルダ `/ (root)` にして保存

## ローカルで実行

ES モジュールと Web Worker を使うため、ローカルサーバーが必要です

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

## ファイル構成

```
index.html          ページ
faq.html            よくある質問
css/style.css       スタイル
js/faq.js           FAQ ページ
js/app.js           画面の処理
js/i18n.js          3 言語の文言
js/codes.js         アップロード用コード
js/layout.js        ショーケースのサイズ
js/media.js         動画 / GIF / 画像の読み込み
js/export.js        フレーム取り込み・エンコード・自動削減
js/gif-worker.js    バックグラウンド処理
js/hexify.js        Hex 修正
vendor/             gifenc・gifuct-js・JSZip（MIT）
```

## 参考

[ayricky/steam-workshop-splitter](https://github.com/ayricky/steam-workshop-splitter)、
[james-ccg/steam-artwork-cropper](https://github.com/james-ccg/steam-artwork-cropper)、
[Fameboyq/steam-artwork-cropper](https://github.com/Fameboyq/steam-artwork-cropper)、
[XTsat/SteamGuide](https://github.com/XTsat/SteamGuide)、
[lannahirave/steam-artwork-simplifier](https://github.com/lannahirave/steam-artwork-simplifier)、
[sapic（steam.design）](https://github.com/sapic/sapic)

© 2026 キスクリ · [MIT](LICENSE) · コミュニティの非営利プロジェクト、Valve / Steam とは無関係
