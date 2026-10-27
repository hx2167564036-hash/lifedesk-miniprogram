/*
 * openid 云函数：返回当前微信用户的 openid
 * 用途：多用户场景下，每个用户的数据文档以 openid 作为 _id，天然隔离
 * 部署：微信开发者工具 → cloud/functions/openid → 右键「上传并部署（云端安装依赖）」
 */
exports.main = async (event) => {
  return {
    openid: event.userInfo && event.userInfo.openId ? event.userInfo.openId : '',
    appid: event.userInfo && event.userInfo.appId ? event.userInfo.appId : ''
  };
};
