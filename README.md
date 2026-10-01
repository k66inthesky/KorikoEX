# 克里克交易所 · KorikoEX

<img src="public/koriko-logo.svg" width="96" alt="KorikoEX 蝴蝶結與掃帚標誌">

![《魔女宅急便》克里克城市街景](public/koriko-city.jpg)

名稱靈感來自《魔女宅急便》的克里克（Koriko）城市：讓閒置價值重新流動的智能交易所。

城市主視覺採用[吉卜力官方釋出劇照](https://www.ghibli.jp/works/majo/)（[原圖 majo047.jpg](https://www.ghibli.jp/gallery/majo047.jpg)）。© 1989 Eiko Kadono/Hayao Miyazaki/Studio Ghibli, N。官方標示可於常識範圍內自由使用；圖片不適用本 repo 的 GPL 程式碼授權。本作品為學習 PoC，與吉卜力無合作或背書關係。

雙 Agent 訂閱殘值估價與測試 USDC 抵押借貸。第一波概念資產為 Codex／Claude 訂閱，保留原 ERC-3643 + DvP 市場。

## 邊界

此作品不接管、不收集、不交易帳號、密碼、Cookie、API Key 或既有官方 credits。SUB-MOCK 是自行發行的模擬抵押 NFT，不代表可轉讓的官方訂閱權利。訂閱效用殘值不等於可清算價值。未取得供應商授權與可轉讓契約時，正式核貸上限是 **0**。

估價 API 尚未提供。線上介面使用標示清楚的模擬 OpenAI／Claude agents，沒有宣稱真正呼叫模型。本地測試鏈 ID 31337；公開 Sepolia 鏈 ID 11155111，必須以真實收據驗證。

## 流程

1. 填入訂閱服務、等級、本期實付、本期開始與到期日。資料為自述，沒有完成供應商驗證。
2. 兩位 agent 各自估價，採較低值。殘值上限為實付價格按剩餘時間比例分攤，分歧超過30%或信心不足即停貸。
3. PoC 最多借估價的30%，年利率12%，按秒累計單利，向上取至1個USDC微單位。不複利。
4. 鎖定模擬抵押憑證，原子撥付測試資金。借款到期須早於訂閱到期且不超過30天。
5. 到期之前全額還本金＋利息，釋放憑證。到期時間起停止接受還款，任何 keeper 均可呼叫清算。
6. 清算把SUB-MOCK移交貸方，記錄未回收債務。這不保證回收本金，也不代表真實帳號被沒收。鏈上不會自行醒來，需要交易呼叫。

## 啟動與驗證

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm test` 先編譯官方T-REX／ONCHAINID與自建借貸合約，再執行合約及估價測試。測試生成 `public/lending-evidence.json` 和 `public/local-evidence.json`，只包含公開測試地址與交易hash，沒有私鑰。

## Sepolia 錢包示範

使用有Sepolia ETH的瀏覽器錢包，開啟作品，選「Sepolia 合約」。預設付款資產為Circle官方Sepolia USDC：

`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`

1. 透過 https://faucet.circle.com/ 領取測試USDC，不要轉入主網USDC。
2. 連接錢包，部署模擬抵押NFT、兩個agent-labelled Oracle及借貸池。
3. 注入10測試USDC。這是真正的測試代幣轉帳，沒有美元價值。
4. 取得模擬估價，登錄抵押NFT及兩筆oracle資料。
5. 選擇不超過池餘額／LTV的本金，授權抵押NFT後借款。
6. 選7天或1天期限演示還款，或選1分鐘期限待到期後清算。還款需持有本金與額外利息。
7. 下載合約證據，查看Sepolia Etherscan的交易收據。頁面保存部署地址及待確認交易，重開後可恢復。

另一付款選項是自建 `mUSDC`，僅供無需faucet的演示，不能稱為Circle USDC。兩種模式由部署時固定的ERC-20地址區分。

## OpenAI 與 Claude API 預留

複製 `.env.example` 到 `.env.local`，在本機或部署平台秘密管理介面設定兩家API key與確定支援結構化輸出的model ID，**不要放在前端或聊天中**。

```sh
npm run agents
```

`server/agents.mjs` 透過OpenAI Responses API與Claude Messages API並行估價，要求JSON schema、檢查每個數值、拒絕部分成功及超出剩餘預付價值的結果。`VALUATION_MODE=live`需要兩家key與model ID，不會自動降級冒充成功。這是待連線驗證的伺服器接入，沒有使用真實key測試。

本機server綁定127.0.0.1，live模式須設定 `VALUATION_API_TOKEN` 驗證。託管網站目前是靜態mock模式，不提供live端點。接上正式後端前需持久化證據、身份驗證、流量控制及獨立oracle簽署審核。PoC兩個Oracle由同一測試錢包操作，不具獨立治理保證。

## 合約與測試範圍

- `contracts/Lending.sol`：抵押NFT、模擬付款、雙Oracle、借貸池。使用SafeERC20、ReentrancyGuard、Ownable；暫停新借款仍允許還款。
- `contracts/Exchange.sol`：官方T-REX元件部署器與原子DvP。
- `web/valuation.mjs`：輸入檢查、保守合併、利息公式。
- `test/lending.test.mjs`：借款、按秒利息、清償、清算、權限、重複抵押、LTV、期限、過期報價、回滾與暫停。
- `test/dvp.test.mjs`：官方ERC-3643 + ONCHAINID Claim、Codex及Claude DvP、未驗證與凍結拒絕交易。

借貸抵押採ERC-721模擬憑證，**不是ERC-3643**。ERC-3643只用於保留的服務憑證市場。兩者未宣稱已整合為同一資產。

## 依賴與風險

Tokeny T-REX 4.1.6，ONCHAINID 2.2.1，OpenZeppelin 4.9.6，Solidity 0.8.17。專案採GPL-3.0-or-later，保留上游著作權與授權。

此為未經獨立資安稽核的非主網PoC。Ganache測試工具的bundled依賴存在已知npm audit漏洞，不打包進託管前端；不應用於接受不受信任輸入的公開節點。詳見 `docs/VALIDATION.md`。

## 官方參考

- https://openai.com/policies/terms-of-use/
- https://openai.com/policies/service-credit-terms/
- https://www.anthropic.com/legal/consumer-terms
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://eips.ethereum.org/EIPS/eip-3643
- https://github.com/TokenySolutions/T-REX

## 品牌標誌

原創 SVG 標誌以蝴蝶結與掃帚組成；官網兩頁與 favicon 共用 `public/koriko-logo.svg`。PNG／ICO 為同一向量的輸出。

錢包連線支援 EIP-6963 選擇瀏覽器錢包，並驗證 Sepolia chain ID 11155111；不支援未設定的手機 WalletConnect。請在安裝錢包的瀏覽器開啟網站，由使用者確認連線、切換網路與所有交易。
