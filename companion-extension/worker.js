import {createRetainer} from './retention.js';

const retainer = createRetainer(chrome);
const ALARM = 'renew-line-login-cookie';
const reportError = () => console.warn('LINE 登入保留：檢查失敗，稍後會再試。');

chrome.cookies.onChanged.addListener(change => {
  void retainer.onChanged(change).catch(reportError);
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) void retainer.sweep().catch(reportError);
});

async function initialize() {
  // Recreate after browser restart; alarm persistence varies with Chrome version.
  await chrome.alarms.create(ALARM, {delayInMinutes: 1, periodInMinutes: 1440});
  await retainer.sweep();
}
chrome.runtime.onStartup.addListener(() => { void initialize().catch(reportError); });
chrome.runtime.onInstalled.addListener(() => { void initialize().catch(reportError); });
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'renew') return false;
  retainer.sweep().then(respond, () => respond({error: true}));
  return true;
});
