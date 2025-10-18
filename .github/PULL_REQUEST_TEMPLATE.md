## タイトル
<!-- 例: feat: NFC打刻の位置判定ロジックをPolygon優先に修正 -->

## 概要（Context）
- 背景/目的:
- 関連Issue/チケット:
- スコープ（含む/含まない）:

## 変更点（Changes）
- [ ] コード
- [ ] 設定/CI
- [ ] ドキュメント

## リスクと影響範囲（Risk/Impact）
- ユーザー影響:
- 互換性:
- デプロイ/ロールバック:

## 動作確認（How to Verify）
- [ ] 単体テスト `pnpm test:ci`
- [ ] 型検査 `pnpm typecheck`
- [ ] Lint `pnpm lint:ci`
- [ ] 手動確認（手順/スクショ/レスポンス等）

## Codex へのレビュー依頼
@codex

**レビュー方針**: `codex.md` を参照。以下を優先チェック願います。
- P0: Secrets露出/クライアント配信の有無、Airtable呼び出しがサーバ限定か、SSR/ISRの非効率
- P1: 設計規約/型安全/責務分離
- P2: 入力バリデーション/非同期エラー/タイムゾーン

**重点ファイル**
- （例）`src/lib/airtable.ts`, `app/api/stamp/route.ts`

**レビュー非対象（除外）**
- UIの微細なスタイル
