const status = document.querySelector('#status');
const button = document.querySelector('#renew');
async function check() {
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({type: 'renew'});
    if (result?.error) throw new Error();
    const cookies = await chrome.cookies.getAll({name: 'lct', domain: 'line-chrome-gw.line-apps.com'});
    const cookie = cookies.find(c => c.domain.replace(/^\./, '') === 'line-chrome-gw.line-apps.com');
    status.textContent = !cookie ? '尚未登入 LINE。登入後會自動處理。'
      : cookie.session ? '登入保存期限尚未延長，請稍後再試。'
      : `本機保存至 ${new Date(cookie.expirationDate * 1000).toLocaleDateString('zh-TW')}。`;
  } catch { status.textContent = '檢查失敗，請稍後重試。'; }
  finally { button.disabled = false; }
}
button.addEventListener('click', check);
void check();
