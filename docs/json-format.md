# Timeweaver JSON 形式

## 基本方針

JSON は Timeweaver の保存形式であり、インポート / エクスポートの正本である。

Mermaid Gantt の `.mmd` 出力は派生形式であり、JSON の代替保存形式やインポート形式ではない。

タイムライン JSON のインポート時は厳格に検証し、エラーが 1 つでもあればファイル全体を読み込まない。部分読み込みや暗黙の補正は行わない。ただし、互換性のため `view.visibleRange` が欠けている場合は `null` として補完する。過去の `view.themePreset` は受理するが無視し、再出力しない。

## トップレベル構造

```json
{
  "schemaVersion": "1.0.0",
  "timeline": {
    "title": "Example Timeline",
    "description": "Optional description",
    "granularity": "day"
  },
  "lanes": [],
  "tags": [],
  "items": [],
  "dependencies": [],
  "view": {}
}
```

## `schemaVersion`

`schemaVersion` は必須とする。

初期版は `"1.0.0"` を使う。

将来の破壊的変更や自動移行の判断に使う。

## 日時形式

日時はタイムゾーンなしの秒精度文字列とする。

形式:

```text
YYYY-MM-DDTHH:mm:ss
```

例:

```json
"2026-07-13T09:30:00"
```

`Z`、`+09:00` などのタイムゾーン指定は付けない。

保存値は完全な日時形式を使うが、アイテム日時は `timeline.granularity` の境界に厳密に揃える。

## `timeline`

```json
{
  "title": "Example Timeline",
  "description": "Optional description",
  "granularity": "day"
}
```

- `title`: タイムライン名。
- `description`: 任意の説明。
- `granularity`: アイテム日時と依存遅延の最小単位。`year` / `month` / `day` / `hour` のいずれか。

## `lanes`

```json
[
  {
    "id": "lane-1",
    "name": "Planning",
    "order": 0
  }
]
```

- `id`: レーン ID。アイテムの `laneId` から参照される。
- `name`: 表示名。改行を含む複数行のプレーンテキストを許可する。
- `order`: 表示順。

## `tags`

```json
[
  {
    "id": "planning",
    "name": "Planning",
    "color": "#2563eb",
    "order": 0
  }
]
```

- `id`: タグ ID。アイテムの `tagIds` から参照される。
- `name`: 表示名。
- `color`: タグ色。CSS hex color を想定する。
- `order`: 表示順。重複時は配列順で安定ソートする。アプリで並べ替えた後は `0` 始まりの連番へ正規化する。

## `items`

時点アイテムと期間アイテムは同じ `items` 配列に入れ、`type` で分岐する。

### 共通属性

```json
{
  "id": "item-1",
  "type": "duration",
  "title": "設計",
  "description": "Optional description",
  "laneId": "lane-1",
  "tagIds": ["planning"],
  "colorTagId": null,
  "color": null
}
```

- `id`: アイテム ID。
- `type`: `"duration"` または `"instant"`。
- `title`: 表示名。
- `description`: 任意の説明。
- `laneId`: 所属レーン ID。
- `tagIds`: タグ ID 配列。
- `colorTagId`: 自動色に使うタグ ID。`null` の場合は `tagIds` の先頭タグを使う。指定する場合は `tagIds` に含まれるタグ ID でなければならない。
- `color`: アイテム固有色。未指定の場合は `null`。

表示色の優先順位:

1. アイテムの `color`
2. `colorTagId` で指定したタグの `color`
3. `tagIds` の先頭タグの `color`
4. デフォルト色

### 期間アイテム

```json
{
  "id": "item-1",
  "type": "duration",
  "title": "設計",
  "description": "Optional description",
  "laneId": "lane-1",
  "tagIds": ["planning"],
  "colorTagId": null,
  "color": null,
  "start": "2026-07-13T00:00:00",
  "end": "2026-07-15T00:00:00"
}
```

期間は `[start, end]` として扱う。`start` と `end` はともに最小単位の開始境界であり、両端を含む。

`end` は `start` 以上でなければならない。両者が同じ場合は最小単位1つの期間を表す。描画・Mermaid 出力では `end` の次の最小単位境界を排他的終端として使う。

### 時点アイテム

```json
{
  "id": "item-2",
  "type": "instant",
  "title": "リリース",
  "description": "Optional description",
  "laneId": "lane-2",
  "tagIds": ["release"],
  "colorTagId": null,
  "color": null,
  "at": "2026-07-20T00:00:00"
}
```

## `dependencies`

```json
[
  {
    "id": "dep-1",
    "fromId": "item-1",
    "toId": "item-2",
    "type": "finish-to-start",
    "lag": 1
  }
]
```

- `id`: 依存関係 ID。
- `fromId`: 先行アイテム ID。
- `toId`: 後続アイテム ID。
- `type`: 初期版では `"finish-to-start"` のみ。
- `lag`: タイムラインの時間粒度で数えた遅延数。正・ゼロ・負を許可する。

Finish-to-Start の基本式:

```text
to.start = from.end + (lag + 1) * timeline.granularity
```

時点アイテムを含む依存では、時点アイテムの基準日時は `at` とする。

依存関係は循環禁止とする。

## `view`

初期版では単一の `view` を保存する。

```json
{
  "scale": "month",
  "visibleRange": null,
  "visibleTagIds": ["planning", "release"],
  "tagFilterMode": "any",
  "laneMode": "manual",
  "itemDisplay": {
    "showLabels": true,
    "showDependencyLines": true
  }
}
```

- `scale`: `"year"` / `"month"` / `"day"` / `"hour"`。
- `visibleRange`: 表示中の時間範囲。`null` の場合は表示対象アイテム全体を自動表示する。ズームまたはパン後は `{ "start": "...", "end": "..." }` 形式で保存する。
- `visibleTagIds`: 表示対象タグ ID。空なら全タグ対象。
- `tagFilterMode`: 初期版では `"any"`。
- `laneMode`: 初期版では `"manual"`。
- `itemDisplay.showLabels`: アイテムラベルを表示するか。
- `itemDisplay.showDependencyLines`: 依存線を表示するか。

タグフィルタは OR / any とする。

`scale` が `"year"` の場合、目盛り線とラベルの間隔は表示範囲と描画幅から自動決定する。JSON には 10 年単位や 100 年単位などの目盛り間隔は保存しない。

`scale` が `"hour"` または `"day"` の場合も、目盛り線とラベルの間隔は表示範囲と描画幅から別々に自動決定する。これらの表示間隔は JSON には保存しない。

開発者向けデバッグ情報オーバーレイの表示状態と診断値は JSON に含めない。ブラウザの同一タブ内だけで扱うUI状態である。

アイテム日時の変更時に後続へ伝播するかどうかの選択も、一時的な操作UI状態であり JSON には保存しない。伝播・非伝播のいずれでも、変更後のアイテム日時と再計算済みの `lag` を保存する。

タグ未設定アイテムは、`visibleTagIds` が空のときだけ表示する。タグが 1 つでも選択されている場合は非表示にする。

`visibleRange` の `start` / `end` は日時と同じ `YYYY-MM-DDTHH:mm:ss` 形式とし、`end` は `start` より後でなければならない。互換性のため、インポート時に `visibleRange` が省略されている場合は `null` として扱う。テーマはタイムライン JSON には含めない。

キャンバス背景、時間軸ヘッダー、レーン領域などの SVG レイアウトは保存対象ではない。テーマと表示範囲から描画時に決定する。

## 検証ルール

インポート時には少なくとも次を検証する。

- `schemaVersion` が存在し、対応バージョンであること。
- 日時が `YYYY-MM-DDTHH:mm:ss` 形式であること。
- 期間アイテムの `end` が `start` 以上であること。
- すべてのアイテム日時が `timeline.granularity` の境界に揃っていること。
- `laneId` が存在するレーンを参照していること。
- `tagIds` が存在するタグを参照していること。
- `colorTagId` が `null` でない場合、存在するタグかつ同じアイテムの `tagIds` に含まれるタグを参照していること。
- `dependencies.fromId` と `dependencies.toId` が存在するアイテムを参照していること。
- 依存関係が循環していないこと。
- ID が各配列内で重複していないこと。
- `view.visibleTagIds` が存在するタグを参照していること。
- `view.visibleRange` が `null` でない場合、`start` / `end` が有効な日時であり、`end` が `start` より後であること。

## サンプル

```json
{
  "schemaVersion": "1.0.0",
  "timeline": {
    "title": "Timeweaver Sample",
    "description": "初期表示用のサンプルタイムライン",
    "granularity": "day"
  },
  "lanes": [
    { "id": "lane-planning", "name": "計画", "order": 0 },
    { "id": "lane-release", "name": "リリース", "order": 1 }
  ],
  "tags": [
    { "id": "planning", "name": "Planning", "color": "#2563eb", "order": 0 },
    { "id": "release", "name": "Release", "color": "#dc2626", "order": 1 }
  ],
  "items": [
    {
      "id": "item-design",
      "type": "duration",
      "title": "設計",
      "description": "基本設計を固める",
      "laneId": "lane-planning",
      "tagIds": ["planning"],
      "colorTagId": null,
      "color": null,
      "start": "2026-07-13T00:00:00",
      "end": "2026-07-15T00:00:00"
    },
    {
      "id": "item-release",
      "type": "instant",
      "title": "リリース",
      "description": "初期版を公開する",
      "laneId": "lane-release",
      "tagIds": ["release"],
      "colorTagId": null,
      "color": null,
      "at": "2026-07-20T00:00:00"
    }
  ],
  "dependencies": [
    {
      "id": "dep-design-release",
      "fromId": "item-design",
      "toId": "item-release",
      "type": "finish-to-start",
      "lag": 4
    }
  ],
  "view": {
    "scale": "day",
    "visibleRange": null,
    "visibleTagIds": [],
    "tagFilterMode": "any",
    "laneMode": "manual",
    "itemDisplay": {
      "showLabels": true,
      "showDependencyLines": true
    }
  }
}
```

## テーマ JSON

テーマはタイムライン JSON とは別ファイルで保存・読込する。テーマ JSON は単独で完結し、プリセット名、テーマ ID、タイムラインへの参照は持たない。

```json
{
  "schemaVersion": "1.0.0",
  "tokens": {
    "timelineBackground": "#ffffff",
    "headerBackground": "#f8fafc",
    "axisLine": "#e2e8f0",
    "axisLineWidth": 1,
    "laneBackground": "#f8fafc",
    "laneBorder": "#e2e8f0",
    "laneBorderWidth": 1,
    "laneLabel": "#334155",
    "tickLabel": "#475569",
    "boundaryTickLabel": "#0f172a",
    "dependencyLine": "#64748b",
    "dependencyLineWidth": 2,
    "itemStroke": "#ffffff",
    "itemStrokeWidth": 2,
    "itemLabel": "#0f172a",
    "itemLabelOnColor": "#ffffff"
  }
}
```

- `schemaVersion`: テーマ形式のバージョン。現時点では `"1.0.0"`。
- `tokens`: テーマ項目の辞書。色は `#RRGGBB`、線幅は `0.5`〜`8` の `0.5` 刻みの数値で、上記の全項目を指定する。`axisLine` / `axisLineWidth` は時間軸の線・目盛り線、`laneBorder` / `laneBorderWidth` はレーン境界線に使う。

テーマ JSON は厳格に検証し、未知の項目、不足項目、不正な色・線幅、未対応バージョンがあれば読み込まない。将来のレーン高、アイテム形状、依存線スタイルなども `tokens` に追加する。
