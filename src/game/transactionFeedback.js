const TRANSACTION_ERRORS = Object.freeze({
  insufficient_funds: { zh: '资源不足', en: 'Insufficient funds' },
  inventory_full: { zh: '该道具已达到库存上限', en: 'This item has reached its inventory limit' },
  invalid_quantity: { zh: '购买数量无效', en: 'Invalid purchase quantity' },
  unknown_item: { zh: '未找到该物品', en: 'Item not found' },
  unknown_tech: { zh: '未找到该科技', en: 'Technology not found' },
  already_unlocked: { zh: '该科技已解锁', en: 'Technology already unlocked' },
  prerequisite: { zh: '请先解锁前置科技', en: 'Unlock the prerequisite first' },
  energy_full: { zh: '体力已达到临时上限', en: 'Energy is at the overflow cap' },
  already_owned: { zh: '该探员已在你的名册中', en: 'This agent is already in your roster' },
  unknown_agent: { zh: '未找到该探员档案', en: 'Agent record not found' },
});

export function transactionErrorMessage(error, lang = 'zh') {
  const locale = lang === 'en' ? 'en' : 'zh';
  return TRANSACTION_ERRORS[error]?.[locale] || '';
}

export function purchaseSuccessMessage(detail = '', lang = 'zh') {
  const message = lang === 'en' ? 'Purchase successful' : '购买成功';
  return detail ? `${message} · ${detail}` : message;
}
