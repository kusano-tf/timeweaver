# Timeweaver 実装ガイド

## 目的

このドキュメントは、Timeweaver を実装・変更するコーディングエージェント向けのガイドである。

実装時は `docs/specification.md` と `docs/json-format.md` を常に同期すること。

## 技術スタック

- React
- TypeScript
- Vite
- pnpm
- Biome
- date-fns
- Zod
- Vitest

## ディレクトリ方針

想定構成:

```text
src/
  components/
  data/
  domain/
  state/
docs/
  specification.md
  json-format.md
.agents/
  implementation-guide.md
```

## ドメインロジック

依存伝播、日時計算、JSON 検証、タグフィルタなどは UI コンポーネントに埋め込まず、`src/domain/` 配下の純粋関数として実装する。

重点領域:

- `src/domain/schema`: Zod スキーマと JSON パース。
- `src/domain/datetime`: タイムゾーンなし日時文字列と date-fns 変換。
- `src/domain/dependencies`: Finish-to-Start 依存、循環検出、後続伝播、`lagSeconds` 再計算。
- `src/domain/filtering`: タグ OR フィルタ。

## 状態管理

初期版の状態管理は React の `useReducer` と Context を使う。

Reducer はタイムラインドキュメントへの変更を扱う。

想定アクション:

- インポート成功時のドキュメント置き換え
- アイテム追加・編集・削除
- アイテム移動
- 依存伝播
- `lagSeconds` 再計算
- タグ・レーン・表示設定の更新
- 未エクスポート変更フラグの更新

Undo / Redo は初期版の必須機能ではない。

## UI

画面表示文言は日本語にする。

コード、API、JSON キーは英語にする。

タイムライン本体は SVG 中心で描画する。フォーム、ツールバー、詳細パネルなどは通常の React DOM で実装する。

初期版の直接操作は次に限定する。

- アイテム選択
- ドラッグによる日時移動
- ドラッグによるレーン変更

バー端ドラッグによる期間リサイズ、依存線のドラッグ作成、範囲選択作成は初期版の必須機能ではない。

## JSON と検証

JSON 形式は `docs/json-format.md` を正とする。

インポートは厳格検証する。エラーがあればファイル全体を読み込まない。

Zod で構造・型・日時形式を検証し、次のような横断的整合性は追加ロジックで検証する。

- ID 重複
- 存在しない ID 参照
- 依存関係の循環
- 期間アイテムの `end > start`

## 日時

保存形式はタイムゾーンなしの秒精度文字列 `YYYY-MM-DDTHH:mm:ss` とする。

実装ではこの文字列を正とし、計算時だけローカル `Date` に変換する。UTC 変換やタイムゾーン付き日時として扱わない。

## 依存関係

初期版は Finish-to-Start のみ実装する。

```text
to.start = from.end + lagSeconds
```

`lagSeconds` は正・ゼロ・負を許可する。

自動伝播は依存先方向のみとする。

後続アイテムを移動する場合、期間アイテムは期間の長さを維持して丸ごと移動し、時点アイテムは `at` を移動する。

ユーザーが後続アイテムを手動移動した場合は、該当する依存関係の `lagSeconds` を再計算する。

依存関係は循環禁止とする。

## テスト

Vitest でドメインロジックの単体テストを必須とする。

少なくとも次をテストする。

- Zod 検証
- 不正日時の拒否
- 期間アイテムの `end > start`
- 存在しない ID 参照の拒否
- 循環依存の検出
- Finish-to-Start 依存の後続伝播
- 後続手動移動時の `lagSeconds` 再計算
- タグ OR フィルタ

UI E2E は初期版では後回しでよい。

## ドキュメント同期ルール

実装で仕様が変わった場合は、同じ変更で次を更新する。

- `docs/specification.md`
- `docs/json-format.md`
- `.agents/implementation-guide.md`

JSON 形式、依存伝播、保存モデル、日時形式、初期版スコープに影響する変更は必ずドキュメントも更新する。
