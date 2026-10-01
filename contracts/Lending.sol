// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

/// No provider credentials or real subscription rights are held by this NFT.
contract MockSubscription is ERC721, Ownable {
    struct Subscription { bytes32 provider; bytes32 plan; uint64 startsAt; uint64 expiresAt; uint256 paidMicros; }
    mapping(uint256=>Subscription) public subscriptions;
    uint256 public nextId;
    constructor() ERC721('MOCK Subscription Collateral', 'SUB-MOCK') {}
    function issue(address to, bytes32 provider, bytes32 plan, uint64 start, uint64 expiry, uint256 paid) external onlyOwner returns(uint256 id) {
        require(start<=block.timestamp && expiry>block.timestamp && expiry>start && paid>0,'invalid subscription');
        id=++nextId;subscriptions[id]=Subscription(provider,plan,start,expiry,paid);_safeMint(to,id);
    }
    function remainingValue(uint256 id) public view returns(uint256) {
        Subscription memory s=subscriptions[id];
        if(block.timestamp>=s.expiresAt)return 0;
        return s.paidMicros*(s.expiresAt-block.timestamp)/(s.expiresAt-s.startsAt);
    }
}
/// Test accounting asset only, not Circle USDC. The official Sepolia USDC may be used instead.
contract MockUSDC is ERC20,Ownable {
    constructor() ERC20('MOCK USDC - TEST ONLY','mUSDC') {}
    function decimals() public pure override returns(uint8){return 6;}
    function mint(address recipient,uint256 amount) external onlyOwner{_mint(recipient,amount);}
}
/// Two distinct agent-labelled oracle contracts. PoC operator confirms both quotes.
/// These attestations do not prove that a model actually ran or performed legal KYC.
contract ValuationOracle is Ownable {
    bytes32 public immutable agent;
    struct Quote {uint256 value;uint64 validUntil;bytes32 evidenceHash;}
    mapping(uint256=>Quote) public quotes;
    event Attested(uint256 indexed collateralId,uint256 value,uint64 validUntil,bytes32 evidenceHash);
    constructor(bytes32 agentId){agent=agentId;}
    function attest(uint256 id,uint256 value,uint64 validUntil,bytes32 evidenceHash) external onlyOwner {
        require(value>0 && validUntil>block.timestamp && validUntil<=block.timestamp+1 days && evidenceHash!=bytes32(0),'invalid quote');
        quotes[id]=Quote(value,validUntil,evidenceHash);emit Attested(id,value,validUntil,evidenceHash);
    }
}
contract SubscriptionLending is Ownable,ReentrancyGuard,IERC721Receiver {
    using SafeERC20 for IERC20;
    enum Status {None,Active,Repaid,Liquidated}
    struct Loan {address borrower;uint256 principal;uint64 startedAt;uint64 dueAt;uint256 valuation;Status status;}
    IERC20 public immutable cash;
    MockSubscription public immutable collateral;
    ValuationOracle public immutable openAIOracle;
    ValuationOracle public immutable claudeOracle;
    address public immutable treasury;
    uint256 public constant APR_BPS=1200;
    uint256 public constant LTV_BPS=3000;
    uint256 public constant YEAR=365 days;
    uint256 public badDebt;
    bool public borrowingPaused;
    mapping(uint256=>Loan) public loans;
    mapping(uint256=>uint256) private closedInterest;
    uint256 private receivingId;
    event Borrowed(uint256 indexed id,address indexed borrower,uint256 principal,uint64 dueAt,uint256 valuation);
    event Repaid(uint256 indexed id,uint256 principal,uint256 interest);
    event Liquidated(uint256 indexed id,address indexed treasury,uint256 unpaidDebt);
    constructor(address payment,address nft,address oracleA,address oracleB,address receiver){
        require(payment.code.length>0 && nft.code.length>0 && oracleA.code.length>0 && oracleB.code.length>0 && oracleA!=oracleB && receiver!=address(0),'invalid configuration');
        require(ValuationOracle(oracleA).agent()!=ValuationOracle(oracleB).agent(),'same agent');
        cash=IERC20(payment);collateral=MockSubscription(nft);openAIOracle=ValuationOracle(oracleA);claudeOracle=ValuationOracle(oracleB);treasury=receiver;
    }
    function setBorrowingPaused(bool paused) external onlyOwner {borrowingPaused=paused;}
    function valuation(uint256 id) public view returns(uint256 result){
        (uint256 a,uint64 untilA,)=openAIOracle.quotes(id);(uint256 b,uint64 untilB,)=claudeOracle.quotes(id);
        require(a>0 && b>0 && block.timestamp<untilA && block.timestamp<untilB,'quotes unavailable');
        result=a<b?a:b;uint256 ceiling=collateral.remainingValue(id);if(result>ceiling)result=ceiling;
        require(result>0,'no residual value');
    }
    function maxBorrow(uint256 id) public view returns(uint256){return valuation(id)*LTV_BPS/10000;}
    function borrow(uint256 id,uint256 principal,uint64 dueAt) external nonReentrant {
        require(!borrowingPaused,'borrowing paused');require(loans[id].status==Status.None,'collateral already used');
        require(collateral.ownerOf(id)==msg.sender,'not collateral owner');
        (,,,uint64 expiry,)=collateral.subscriptions(id);
        require(dueAt>block.timestamp && dueAt<expiry && dueAt<=block.timestamp+30 days,'invalid maturity');
        uint256 value=valuation(id);require(principal>0 && principal<=value*LTV_BPS/10000,'LTV exceeded');
        require(cash.balanceOf(address(this))>=principal,'insufficient liquidity');
        loans[id]=Loan(msg.sender,principal,uint64(block.timestamp),dueAt,value,Status.Active);
        receivingId=id;collateral.safeTransferFrom(msg.sender,address(this),id);receivingId=0;
        cash.safeTransfer(msg.sender,principal);emit Borrowed(id,msg.sender,principal,dueAt,value);
    }
    function interest(uint256 id) public view returns(uint256){
        Loan memory l=loans[id];if(l.status==Status.None)return 0;
        if(l.status!=Status.Active)return closedInterest[id];
        uint256 end=block.timestamp<l.dueAt?block.timestamp:l.dueAt;
        uint256 numerator=l.principal*APR_BPS*(end-l.startedAt);
        // Round accrued interest up to one cash micro-unit. No compound interest.
        return numerator==0?0:(numerator-1)/(10000*YEAR)+1;
    }
    function debt(uint256 id) public view returns(uint256){return loans[id].principal+interest(id);}
    function repay(uint256 id,uint256 maximumPayment) external nonReentrant {
        Loan storage l=loans[id];require(l.status==Status.Active && msg.sender==l.borrower,'not active borrower');
        require(block.timestamp<l.dueAt,'loan overdue');uint256 i=interest(id);uint256 payment=l.principal+i;
        require(payment<=maximumPayment,'payment exceeds limit');closedInterest[id]=i;l.status=Status.Repaid;
        cash.safeTransferFrom(msg.sender,address(this),payment);collateral.safeTransferFrom(address(this),l.borrower,id);
        emit Repaid(id,l.principal,i);
    }
    function liquidate(uint256 id) external nonReentrant {
        Loan storage l=loans[id];require(l.status==Status.Active && block.timestamp>=l.dueAt,'not liquidatable');
        uint256 unpaid=debt(id);closedInterest[id]=interest(id);l.status=Status.Liquidated;badDebt+=unpaid;
        collateral.safeTransferFrom(address(this),treasury,id);emit Liquidated(id,treasury,unpaid);
    }
    function onERC721Received(address,address,uint256 id,bytes calldata) external view override returns(bytes4){
        require(msg.sender==address(collateral) && receivingId==id && id!=0,'unsolicited collateral');return this.onERC721Received.selector;
    }
}
