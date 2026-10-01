# 驗證紀錄

2026-10-01，Node 24.13.0。

- Solidity 0.8.17編譯成功，EIP-170部署程式大小檢查通過。
- `npm test`：4組測試全部通過。包含18項借貸安全／流程檢查、官方T-REX ERC-3643 + ONCHAINID驗證，以及Codex／Claude兩筆本地DvP。
- 雙API adapter以stub回應測試JSON解析、獨立請求與失敗封閉；未提供真實API key，所以沒有連線驗證。
- `npm run build`：Vite 6.4.3成功，前端主要合約／ethers共用chunk約529KB，有bundler大小提示。
- 瀏覽器手動測試：估價、10單位本金借款、增加1天時間、利息0.003288、還款釋放、7天到期利息0.023014、清算移交均成功。全部為標示清楚的瀏覽器展示。
- 公開Sepolia：尚未由使用者錢包簽署，未宣稱已部署或成功借貸。網站預留部署、Circle官方測試USDC、入金、估價登錄、借款、還款、清算與證據下載。

## 依賴稽核

執行npm audit後更新ethers至6.17.0、Vite至6.4.3。完整稽核仍有35項（2 low、5 moderate、23 high、5 critical），主要源自Ganache內建測試依賴，以及solc測試編譯工具的tmp依賴。

這些工具不匯入前端，靜態部署包不包含node_modules或測試伺服器。沒有使用破壞性audit fix --force變更既有Solidity/T-REX工具鏈。這不等同零風險或獨立合約資安稽核。

## 已知限制

- 帳號無可轉讓／可清算權利，正式借貸價值為0。
- 估價API未接線，前端mock價格不是模型輸出或官方定價。
- 同一PoC錢包控制雙Oracle與模擬抵押發行，沒有獨立治理或真實帳號反重複質押驗證。
- 清算依外部送交易，不具已部署的定時keeper。
- 清算只移交NFT，無拍賣／回收款分配，所以記錄badDebt，不保證貸方無損。
- ERC-3643服務市場與ERC-721抵押借貸是分開的PoC資產。
- 目前live adapter只綁定本機，未部署經驗證的公開AI後端。

## KorikoEX logo 與錢包更新（2026-10-01）

- `npm test`：8 個測試全部通過，包含既有 ERC-3643／DvP 與借貸合約整合測試，以及 4 個 Sepolia 錢包測試（未知網路、錯誤網路、使用者拒絕、缺少錢包）。
- Chrome 實際偵測到 MetaMask 與 OKX Wallet；MetaMask 連線請求已發起，待使用者確認。公開測試網交易尚未完成，不宣稱鏈上成功。
- 原創 SVG 標誌共用於兩頁導覽列與 favicon，另提供 PNG、ICO 與 Apple touch icon。

## Sepolia USDC 與錢包綁定（2026-10-01）

- 10 個 Node 測試全部通過：既有 ERC-3643 DvP／借貸整合、錢包切鏈與拒絕，以及舊付款代幣與錯誤網路阻擋。
- Vite production build 通過；仍有既有共享 JS chunk 大於 500 kB 的提示。
- Chrome 實測 OKX 錢包綁定、讀取 40 Sepolia USDC、一鍵斷開、餘額／signer 清除及重新綁定成功。
- Circle 官方 Ethereum Sepolia USDC 地址已按官方文件核對；公開 Sepolia 禁用 MockUSD／MockUSDC，舊部署儲存資料隔離。
- 公開 Sepolia 市場部署流程已啟動，尚待使用者錢包簽署與成功收據；未將本地交易冒稱公開測試網交易。

## 低額度交易限制（2026-10-01）

- Codex／Claude 價格改為 0.10／0.15 Sepolia USDC，預設 1 枚。
- `npm test`：10 個測試全部通過，新增 DvP 客戶端與合約拒絕超過 5 USDC、拒絕後付款餘額不變的檢查。
- `npm run build` 通過。
- Sepolia 管理合約與 Claim Topics 元件已有成功收據；市場部署與 DvP 實測尚未全部完成。
- Chrome 已顯示低價與單筆 5 USDC 限額；自主測試因 Mac 鎖定而暫停，需使用者手動解鎖。

## 公開 Sepolia DvP 成果（2026-10-01）

- 完整市場已完成部署、兩筆 mock Claim 簽署、資格登錄、兩批憑證與庫存設定。
- Codex 1 枚支付 0.10 USDC，區塊 11820538：`0x1a4c53a49ae52f956033fd1763cb027d7912f959f766776b7767338d1e1738d2`。
- Claude 1 枚支付 0.15 USDC，區塊 11820549：`0x9f1053e5898058d3edce31dc7f2890b617582abd476c61de3ba9d2e767966439`。
- `node scripts/verify-sepolia.mjs` 獨立讀取公開 RPC，核對成功收據、Settled 事件、Circle USDC Transfer 與 ERC-3643 憑證 Transfer，兩筆通過。
- 交易後錢包 USDC 由 40 變為 39.75，兩類憑證各持有 1 枚。完整證據位於 `public/sepolia-evidence.json`。
- 修正 OKX RPC 過舊的收據／程式碼／gas 估算狀態，簽署仍留在瀏覽器錢包。讀取 RPC 禁用批次請求並設定逾時。
- `node --test test/*.test.mjs` 最新 10 組測試通過，包含精確授權、借貸流程與回滾。
- ChatGPT Plus、Claude 20x 模擬綁定與估價、1 單位借款、一天利息 0.000329、還款釋放，以及到期清算展示均通過。
- 公開借貸池目前僅確認抵押 NFT 元件，尚未完成公開借款／還款／清算。Mac 再次鎖定，等待手動解鎖後接續測試。
