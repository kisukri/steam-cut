# Steam プロフィール装飾ツール

[中文](README.md) | [English](README.en.md) | **日本語**

**https://kisukri.github.io/steam-cut/**

Steam プロフィールのショーケース素材を作るフロントエンドだけのツールです。処理はすべてブラウザ内で行います

## できること

- 動画 / GIF / 画像を、ワークショップ（5 枠）、アートワーク / スクリーンショット（2 枠）、おすすめアートワーク（1 枠）用の GIF に分割
- 画像やアルバムアートを回るレコード / CD にして、ガイドのアイコンに
- 曲から「プレイヤー風」のガイドタイトルと説明文を作成
- ショーケースごとのアップロード用コンソールコードを表示

## 技術スタック

| 部分 | 使っているもの |
|---|---|
| ページ | 素の HTML / CSS / JavaScript（ES モジュール）、フレームワーク・ビルドなし |
| 画像処理 | Canvas 2D、`<video>` / `<img>` のデコード |
| GIF デコード | [gifuct-js](https://github.com/matt-way/gifuct-js) |
| GIF エンコード | [gifenc](https://github.com/mattdesl/gifenc)、Web Worker で実行 |
| zip ダウンロード | [JSZip](https://github.com/Stuk/jszip)、押したときに読み込み |
| 多言語 | 言語ごとに 1 モジュール、`import()` で必要なときだけ読み込み |
| 設定の保存 | localStorage |
| 公開 | GitHub Pages（静的ファイル） |

## 仕組み

- **分割**：Steam の実際の表示幅で範囲を分け、枠の隙間にあたるピクセルは捨てるので、つなぎ目がずれません
- **フレーム取得**：動画は `<video>` で 1 コマずつ seek して Canvas に描画、GIF は gifuct-js で各コマをデコードして合成
- **パレット**：各コマで帯全体をまとめて 256 色に減色してから分割するので、つなぎ目の色が揃います。コマは 1 ピクセル 1 バイトのインデックスで保持し、メモリは RGBA の約 1/4
- **上限に収める**（ショーケース 5MB、ガイド画像 2MB）：1 コマのサイズを見積もり、超えるなら均等にコマを間引いて遅延を延ばし、全体の長さは変えません。GIF の遅延は 1/100 秒単位なので、丸め誤差は次のコマへ繰り越します
- **Hex 編集**：GIF の最後のバイト `0x3B` を `0x21` に変えると、Steam が再圧縮しなくなります
- **アップロード用コード**：Steam のアップロードページのコンソールで `$J` を使って隠しフォームの値を変え（例：`image_width` を 1000、`image_height` を 1）、もう一度読んで反映を確認します
- **回るレコード**：Canvas でコマごとにジャケットを回転させ、その上に動かない反射を描きます。円の外と中央の穴は透明（不透明なピクセルだけを減色し、透明用にインデックスを 1 つ確保）
- **アルバムアート**：ファイルのバイトを直接解析。mp3 は ID3v2 の APIC、flac は PICTURE ブロック、m4a は `covr` atom。曲名とアーティストも一緒に取得
- **プレイヤーテキスト**：`─` と丸で再生位置のバーを組み立てます。Steam のショーケースは説明文の改行をスペースにするので、1 行で書いて幅で折り返させています

## ローカルで動かす

ES モジュールと Web Worker は HTTP 経由でないと動かないので、ファイルを直接開くのではなくサーバーを立てます：

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

## 構成

```
index.html / faq.html  ページ
css/style.css          スタイル
js/app.js              入口
js/source.js           ファイル読み込み
js/media.js            動画 / GIF / 画像のデコード
js/cover.js            ジャケットとタグの解析
js/stage.js            範囲選択、元に戻す
js/preview.js          プレビュー
js/export.js           フレーム取得、コマ間引き
js/gif-worker.js       減色とエンコード（Worker）
js/hexify.js           Hex 編集
js/guide.js            回るレコードの描画
js/player-text.js      プレイヤーテキスト
js/codes.js            アップロード用コード
js/layout.js           各ショーケースのサイズ
js/i18n.js, js/lang/   多言語
js/prefs.js            設定の保存
vendor/                gifenc、gifuct-js、JSZip（MIT）
```

## 参考

[ayricky/steam-workshop-splitter](https://github.com/ayricky/steam-workshop-splitter)、
[james-ccg/steam-artwork-cropper](https://github.com/james-ccg/steam-artwork-cropper)、
[Fameboyq/steam-artwork-cropper](https://github.com/Fameboyq/steam-artwork-cropper)、
[XTsat/SteamGuide](https://github.com/XTsat/SteamGuide)、
[lannahirave/steam-artwork-simplifier](https://github.com/lannahirave/steam-artwork-simplifier)、
[sapic（steam.design）](https://github.com/sapic/sapic)

© 2026 キスクリ · [MIT](LICENSE) · コミュニティの非営利プロジェクトで、Valve / Steam とは関係ありません
