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
