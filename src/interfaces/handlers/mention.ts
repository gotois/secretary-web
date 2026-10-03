/**
 * @description Обработка упоминания бота в групповом чате
 * @param {unknown} _activity - активность ActivityPub
 * @param {object} _message - сообщение Telegram
 * @param {object} _bot - экземпляр бота
 */
export default /*async */ (_activity: unknown, _message, _bot) => {
  // TODO: определить авторизацию и контекст группы до прямого вызова ассистента по упоминанию.
  console.log('Упоминание ассистента пока не поддерживается');
};
