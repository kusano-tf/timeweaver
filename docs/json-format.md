# Timeweaver JSON 形式

## 基本方針

JSON は Timeweaver の保存形式であり、インポート / エクスポートの正本である。

インポート時は厳格に検証し、エラーが 1 つでもあればファイル全体を読み込まない。部分読み込みや暗黙の補正は行わない。

## トップレベル構造

```json
{
  "schemaVersion": "1.0.0",
  "timeline": {
    "title": "Example Timeline",
    "description": "Optional description"
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

## `timeline`

```json
{
  "title": "Example Timeline",
  "description": "Optional description"
}
```

- `title`: タイムライン名。
- `description`: 任意の説明。

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
- `name`: 表示名。
- `order`: 表示順。

## `tags`

```json
[
  {
    "id": "planning",
    "name": "Planning",
    "color": "#2563eb"
  }
]
```

- `id`: タグ ID。アイテムの `tagIds` から参照される。
- `name`: 表示名。
- `color`: タグ色。CSS hex color を想定する。

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
  "color": null
}
```

- `id`: アイテム ID。
- `type`: `"duration"` または `"instant"`。
- `title`: 表示名。
- `description`: 任意の説明。
- `laneId`: 所属レーン ID。
- `tagIds`: タグ ID 配列。
- `color`: アイテム固有色。未指定の場合は `null`。

表示色の優先順位:

1. アイテムの `color`
2. 先頭タグの `color`
3. デフォルト色

### 期間アイテム

```json
{
  "id": "item-1",
  "type": "duration",
  "title": "設計",
  "description": "Optional description",
  "laneId": "lane-1",
  "tagIds": ["planning"],
  "color": null,
  "start": "2026-07-13T09:00:00",
  "end": "2026-07-15T18:00:00"
}
```

期間は `[start, end)` として扱う。

`end` は必ず `start` より後でなければならない。

### 時点アイテム

```json
{
  "id": "item-2",
  "type": "instant",
  "title": "リリース",
  "description": "Optional description",
  "laneId": "lane-2",
  "tagIds": ["release"],
  "color": null,
  "at": "2026-07-20T10:00:00"
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
    "lagSeconds": 86400
  }
]
```

- `id`: 依存関係 ID。
- `fromId`: 先行アイテム ID。
- `toId`: 後続アイテム ID。
- `type`: 初期版では `"finish-to-start"` のみ。
- `lagSeconds`: ラグ秒数。正・ゼロ・負を許可する。

Finish-to-Start の基本式:

```text
to.start = from.end + lagSeconds
```

時点アイテムを含む依存では、時点アイテムの基準日時は `at` とする。

依存関係は循環禁止とする。

## `view`

初期版では単一の `view` を保存する。

```json
{
  "scale": "month",
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
- `visibleTagIds`: 表示対象タグ ID。空なら全タグ対象。
- `tagFilterMode`: 初期版では `"any"`。
- `laneMode`: 初期版では `"manual"`。
- `itemDisplay.showLabels`: アイテムラベルを表示するか。
- `itemDisplay.showDependencyLines`: 依存線を表示するか。

タグフィルタは OR / any とする。

タグ未設定アイテムは、`visibleTagIds` が空のときだけ表示する。タグが 1 つでも選択されている場合は非表示にする。

## 検証ルール

インポート時には少なくとも次を検証する。

- `schemaVersion` が存在し、対応バージョンであること。
- 日時が `YYYY-MM-DDTHH:mm:ss` 形式であること。
- 期間アイテムの `end` が `start` より後であること。
- `laneId` が存在するレーンを参照していること。
- `tagIds` が存在するタグを参照していること。
- `dependencies.fromId` と `dependencies.toId` が存在するアイテムを参照していること。
- 依存関係が循環していないこと。
- ID が各配列内で重複していないこと。
- `view.visibleTagIds` が存在するタグを参照していること。

## サンプル

```json
{
  "schemaVersion": "1.0.0",
  "timeline": {
    "title": "Timeweaver Sample",
    "description": "初期表示用のサンプルタイムライン"
  },
  "lanes": [
    { "id": "lane-planning", "name": "計画", "order": 0 },
    { "id": "lane-release", "name": "リリース", "order": 1 }
  ],
  "tags": [
    { "id": "planning", "name": "Planning", "color": "#2563eb" },
    { "id": "release", "name": "Release", "color": "#dc2626" }
  ],
  "items": [
    {
      "id": "item-design",
      "type": "duration",
      "title": "設計",
      "description": "基本設計を固める",
      "laneId": "lane-planning",
      "tagIds": ["planning"],
      "color": null,
      "start": "2026-07-13T09:00:00",
      "end": "2026-07-15T18:00:00"
    },
    {
      "id": "item-release",
      "type": "instant",
      "title": "リリース",
      "description": "初期版を公開する",
      "laneId": "lane-release",
      "tagIds": ["release"],
      "color": null,
      "at": "2026-07-20T10:00:00"
    }
  ],
  "dependencies": [
    {
      "id": "dep-design-release",
      "fromId": "item-design",
      "toId": "item-release",
      "type": "finish-to-start",
      "lagSeconds": 405600
    }
  ],
  "view": {
    "scale": "day",
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
