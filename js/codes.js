// every code prints ✅/⚠️ so ppl can tell if it actually worked
// blank title trick: U+200E + space. plain space gets rejected
import { t } from './i18n.js';

export const UPLOAD_URL = 'https://steamcommunity.com/sharedfiles/edititem/767/3/';
// guide icon doesn't need code, just the right page. 760 -> clear corner, 753 -> steam logo
export const GUIDE_URL = 'https://steamcommunity.com/sharedfiles/editguide/?appid=760';
export const GUIDE_URL_STEAM = 'https://steamcommunity.com/sharedfiles/editguide/?appid=753';

const BASE = {
  workshop: `$J('[name=consumer_app_id]').val(480),$J('[name=file_type]').val(0),$J('[name=visibility]').val(0)`,
  artwork: `$J('#image_width').val(1000),$J('#image_height').val(1)`,
  screenshot: `$J('#image_width').val(1000),$J('#image_height').val(1),$J('[name=file_type]').val(5)`,
  featured: `$J('#image_width').val(1000),$J('#image_height').val(1)`,
};

// read it back, don't trust the set
const CHECK = {
  workshop: `$J('[name=consumer_app_id]').val()=='480'&&$J('[name=file_type]').val()=='0'`,
  artwork: `$J('#image_width').val()=='1000'&&$J('#image_height').val()=='1'`,
  screenshot: `$J('#image_width').val()=='1000'&&$J('#image_height').val()=='1'&&$J('[name=file_type]').val()=='5'`,
  featured: `$J('#image_width').val()=='1000'&&$J('#image_height').val()=='1'`,
};

const TITLE = `$J('[name=title]').val('\\u200E ')`;
const TITLE_CHECK = `$J('[name=title]').length`;

const REPEAT = { workshop: 'code.repeat.workshop', artwork: 'code.repeat.two', screenshot: 'code.repeat.two', featured: 'code.repeat.one', guide: 'code.repeat.one' };

export const LAYOUT_TARGETS = {
  workshop: ['workshop'],
  artwork: ['artwork', 'screenshot'],
  featured: ['featured'],
  guide: ['guide'],
};

const q = (s) => JSON.stringify(s);

export function mainCode(key) {
  return `${BASE[key]};console.log(${CHECK[key]}?${q(t('con.ok'))}:${q(t('con.fail'))});`;
}

export function blankCode() {
  return `${TITLE};console.log(${TITLE_CHECK}?${q(t('con.blankOk'))}:${q(t('con.blankFail'))});`;
}

export function mergedCode(key) {
  return `${BASE[key]},${TITLE};console.log(!(${CHECK[key]})?${q(t('con.fail'))}:${TITLE_CHECK}?${q(t('con.ok'))}:${q(t('con.blankFail'))});`;
}

export function showcaseInfo(key) {
  return {
    name: t('show.' + key),
    what: t('code.what.' + key),
    repeat: t(REPEAT[key]),
    place: t('code.place.' + key),
  };
}
