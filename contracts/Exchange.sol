// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/// @notice Deploys and initializes official T-REX components in one transaction.
/// The user's wallet controls this PoC administration hub. No production KYC implied.
contract DeploymentHub is Ownable {
    event Deployed(address indexed component);
    function deploy(bytes memory code, bytes calldata initialization) external onlyOwner returns(address component) {
        assembly { component := create(0, add(code, 32), mload(code)) }
        require(component != address(0), 'deployment failed');
        if (initialization.length > 0) {
            (bool ok, bytes memory result) = component.call(initialization);
            if (!ok) assembly { revert(add(result, 32), mload(result)) }
        }
        emit Deployed(component);
    }
    function execute(address[] calldata targets, bytes[] calldata calls) external onlyOwner {
        require(targets.length == calls.length, 'length mismatch');
        for (uint i; i<targets.length; i++) {
            (bool ok, bytes memory result) = targets[i].call(calls[i]);
            if (!ok) assembly { revert(add(result, 32), mload(result)) }
        }
    }
}

contract MockUSD is ERC20 {
    constructor(address buyer) ERC20('Test USD - no monetary value', 'mUSD') { _mint(buyer, 10000 * 10**6); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// @notice Fixed-price primary inventory, not an open orderbook. Each trade is atomic.
contract AtomicDvP is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    IERC20 public immutable cash;
    mapping(address => uint256) public unitPrice;
    mapping(address => bool) public enabled;
    bool public paused;
    uint256 public orderNonce;
    event Settled(uint256 indexed orderId, address indexed buyer, address indexed asset, uint256 units, uint256 payment);
    constructor(address payment) { cash=IERC20(payment); }
    function list(address asset, uint256 price) external onlyOwner {
        require(asset.code.length>0 && price>0, 'invalid listing');
        unitPrice[asset]=price; enabled[asset]=true;
    }
    function setPaused(bool value) external onlyOwner { paused=value; }
    function buy(address asset,uint256 units,uint256 maxPayment,uint256 deadline) external nonReentrant {
        require(!paused && enabled[asset], 'market unavailable');
        require(block.timestamp<=deadline && units>0,'invalid order');
        uint256 payment=units*unitPrice[asset];
        require(payment<=maxPayment,'price exceeds limit');
        require(payment<=5 * 10**6,'per trade limit: 5 USDC');
        // If the asset leg rejects the buyer's claim, the cash leg rolls back too.
        cash.safeTransferFrom(msg.sender,address(this),payment);
        IERC20(asset).safeTransfer(msg.sender,units);
        emit Settled(++orderNonce,msg.sender,asset,units,payment);
    }
    function withdrawCash(address recipient,uint256 amount) external onlyOwner { cash.safeTransfer(recipient,amount); }
}

import '@tokenysolutions/t-rex/contracts/compliance/legacy/BasicCompliance.sol';
/// @notice A service batch has a fixed expiry. Eligibility is enforced by T-REX identity registry.
contract CreditCompliance is BasicCompliance {
    uint256 public immutable expiresAt;
    constructor(uint256 expiry) { require(expiry>block.timestamp,'expiry in past'); expiresAt=expiry; }
    function canTransfer(address,address,uint256) external view override returns(bool) {return block.timestamp<expiresAt;}
    function transferred(address,address,uint256) external override onlyToken {}
    function created(address,uint256) external override onlyToken {}
    function destroyed(address,uint256) external override onlyToken {}
}
