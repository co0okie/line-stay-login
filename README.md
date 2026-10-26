# LINE 登入保留

避免 Chrome 版 LINE 在關閉最後一個視窗後，因登入 Cookie 被丟棄而要求重新掃碼。

這是獨立的本機 Chrome 輔助擴充功能，**不修改 LINE 官方擴充功能**。只延長
`line-chrome-gw.line-apps.com` 的 `lct` Cookie 保存期限，不備份 Cookie、上傳資料或讀取聊天內容。
Chrome 的單次 Cookie 保存期限上限為 400 天；本工具在使用期間持續延長期限。

## 安裝

1. 在使用 LINE 的同一個 Chrome 個人資料中，開啟 `chrome://extensions/`。
2. 開啟右上角「開發人員模式」。
3. 點「載入未封裝項目」，選擇本 repo 的 **`companion-extension`** 資料夾。
4. 確認出現「LINE 登入保留」。點擴充功能按鈕可查看本機保存日期。

目前機器的資料夾為 `/home/co0okie/repo/line-diagnostics/companion-extension`。
載入後請保留資料夾位置，Chrome 會從這裡讀取程式。

## 到期、更新和登出

- 新登入或 LINE 替換 Cookie：自動把新的 Cookie 改成保留最多 400 天。
- Chrome 啟動、安裝或更新本工具時：檢查現有 Cookie。
- Chrome 執行期間每天檢查一次；剩餘不足 395 天時，再延長到 400 天。
- LINE 官方更新：不會覆蓋這個獨立工具；若登入機制或 Cookie 名稱改變，工具可能需要更新。
- 主動登出：不恢復已刪除的 Cookie。再次登入後才處理新的 Cookie。
- 伺服器撤銷登入、LINE 更新使本機憑證不相容、清除瀏覽資料，或超過保存期限未開 Chrome：仍可能需要重新登入。

本機延長保存時間**不等於延長 LINE 伺服器端的有效期**，也無法保證永久登入。
工具沒有背景常駐頁面，不需要持續開著除錯器或讓 Chrome 一直執行。

## 更新與移除

更新本 repo 的檔案後，在 `chrome://extensions/` 點「LINE 登入保留」的重新載入按鈕。
移除或停用輔助功能後，不會再延長期限；現有 Cookie 的期限不會自動縮短。
若要結束登入，請使用 LINE 的登出功能。

## 開發與驗證

不需要安裝套件。使用 Node.js 24 或更新版本執行：

```sh
npm test
```

測試涵蓋 session Cookie 轉換、自己的變更事件不形成迴圈、登出刪除、非同步刪除、
新登入取代舊 Cookie、定期延長、網域限制、Cookie store/partition 與 API 失敗恢復。

`companion-extension/` 為可安裝程式；`retention.test.mjs` 為測試。
`cdp-client.mjs` 和 `devtools-client.py` 是可選的診斷工具，正常使用不需要它們。
診斷工具的用法寫在檔案開頭；MCP 工具需要另外下載官方 `chrome-devtools-mcp`。
本機 `trace-*.jsonl` 與 `findings.txt` 已排除於 Git 之外，不要公開原始診斷紀錄。

## 已驗證與限制

在 Chrome 156、LINE 擴充功能 3.7.2 上，已實測將現有登入 Cookie 改成 persistent 後，
Chrome 完全結束再開啟，LINE 可以直接恢復登入。本次登入的 Cookie 已設為 400 天。
這證明 Cookie 保存方式是本次重現的關鍵；不代表所有 LINE 登入失效都由 Cookie 引起。
輔助擴充功能已實機安裝並驗證：將現有登入 Cookie 暫時改回 session 形式後，
工具自動恢復為 400 天的 persistent Cookie；每日檢查的 alarm 也已建立。
模擬 Chrome API 的 8 個測試全部通過。

## 參考

- [Chrome Cookie 最長 400 天](https://developer.chrome.com/blog/cookie-max-age-expires)
- [Chrome Cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)

本專案與 LINE、LY Corporation 或 Google 無隸屬關係。
