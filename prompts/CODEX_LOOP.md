# priconner_clan_ranking_formatter 再開プロンプト（Loop Engineering）

AGENTS.mdとdocs/LOOP_ENGINEERING.mdを先に読み、正本（AGENTS.md、README.md、src/、tests/）の未完了1件を選んで現状→仮説→最小修正→テスト→評価→引継ぎの1ループを**実行**する。例: 順位連番・重複判定・欠番などの未検証境界1件 は候補に過ぎず、未完了の事実を確認すること。READYがなければ独立小タスクを選ぶ。Blockedの場合は別タスクに移る。

検証: npm test ; npm run build。安全境界: 画像・クラン非公開情報の外部送信、確認前のPages公開をしない。変更・試験の実証なしにPASSとしない。外部公開、実機/本番操作、push、同一失敗への無根拠再試行を禁止。

出力は変更ファイル・テストコマンド/結果・PASS/BLOCKED_INPUT/BLOCKED_ENV/TEST_INFRA_ERROR/TASK_FAIL・次タスクを必須にする。1起動で1タスクのみ実行し、永続ループは許可済みOSスケジューラーに委ねる。
