/**
 * Puti-AI 禪宗讀書會 Kahoot 式互動思辨系統 (後端核心)
 * 屏東縣後庄國小黃朝榮老師作品
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  var role = (e && e.parameter && e.parameter.role) ? e.parameter.role : 'player';
  
  // 講者進入時若帶有 reset 參數，或直接強制重置為全新作答中
  if (e && e.parameter && e.parameter.reset === '1') {
    resetGameInternal();
  }

  template.role = role;
  template.appUrl = ScriptApp.getService().getUrl();
  
  return template.evaluate()
    .setTitle('Puti-AI | 現場互動思辨：人生關鍵抉擇')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 取得遊戲最新狀態
function getGameState(voterId) {
  var props = PropertiesService.getScriptProperties();
  var stateRaw = props.getProperty('GAME_STATE');
  var state;
  
  if (!stateRaw) {
    state = resetGameInternal();
  } else {
    try {
      state = JSON.parse(stateRaw);
    } catch(err) {
      state = resetGameInternal();
    }
  }

  // 確保 votes 物件完整
  if (!state.votes) state.votes = { "A": 0, "B": 0, "C": 0, "D": 0 };
  if (!state.status) state.status = 'answering';

  var myChoice = (voterId && state.voters && state.voters[voterId]) ? state.voters[voterId] : null;
  
  return {
    success: true,
    currentQ: (state.currentQ !== undefined) ? state.currentQ : 0,
    status: state.status, // "answering" | "ended" | "revealed"
    votes: state.votes,
    voterCount: Object.keys(state.voters || {}).length,
    myChoice: myChoice
  };
}

// 用戶手機提交投票
function submitVote(voterId, qIndex, choice) {
  if (!voterId || !choice) return { success: false, msg: "缺少參數" };
  
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(5000);
    var stateRaw = props.getProperty('GAME_STATE');
    var state = stateRaw ? JSON.parse(stateRaw) : resetGameInternal();

    // 只有在 answering 狀態允許投票
    if (state.currentQ !== qIndex || state.status !== 'answering') {
      return { success: false, msg: "目前已截止作答或題目已切換" };
    }

    if (!state.voters) state.voters = {};
    if (!state.votes) state.votes = { "A": 0, "B": 0, "C": 0, "D": 0 };

    var oldChoice = state.voters[voterId];
    if (oldChoice && state.votes[oldChoice] > 0) {
      state.votes[oldChoice]--;
    }

    state.voters[voterId] = choice;
    state.votes[choice] = (state.votes[choice] || 0) + 1;

    props.setProperty('GAME_STATE', JSON.stringify(state));
    return { success: true, myChoice: choice };
  } catch(e) {
    return { success: false, msg: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 講者手動主控操作
function hostAction(action, data) {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(5000);
    var stateRaw = props.getProperty('GAME_STATE');
    var state = stateRaw ? JSON.parse(stateRaw) : resetGameInternal();

    if (action === 'startQuestion') {
      var qIndex = (data && data.qIndex !== undefined) ? data.qIndex : 0;
      state.currentQ = qIndex;
      state.status = 'answering'; // 切題必定自動開放作答
      state.votes = { "A": 0, "B": 0, "C": 0, "D": 0 };
      state.voters = {};
    } else if (action === 'reopenVote') {
      // 重新開放本題作答：重置本題票數與記錄
      state.status = 'answering';
      state.votes = { "A": 0, "B": 0, "C": 0, "D": 0 };
      state.voters = {};
    } else if (action === 'endVoting') {
      // 截止作答並開票
      state.status = 'ended';
    } else if (action === 'revealMaster') {
      // 切換揭曉狀態：若已揭曉則收起回 ended，若未揭曉則展開為 revealed
      state.status = (state.status === 'revealed') ? 'ended' : 'revealed';
    } else if (action === 'resetAll') {
      state = resetGameInternal();
    }

    props.setProperty('GAME_STATE', JSON.stringify(state));
    return getGameState();
  } catch(e) {
    return { success: false, msg: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 重置狀態為第 1 題開放作答中
function resetGameInternal() {
  var state = {
    currentQ: 0,
    status: 'answering',
    votes: { "A": 0, "B": 0, "C": 0, "D": 0 },
    voters: {}
  };
  PropertiesService.getScriptProperties().setProperty('GAME_STATE', JSON.stringify(state));
  return state;
}
