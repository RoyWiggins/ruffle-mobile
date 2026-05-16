package {
    import flash.display.MovieClip;
    import flash.events.Event;
    import flash.utils.setTimeout;

    [SWF(width="1", height="1", backgroundColor="#000000", frameRate="30")]
    public class NP9GamingSystemStub extends MovieClip {

        public static const RESTART_CLICKED:String = "TheRestartBtnClicked";

        private var _gameData:Object;
        private var _restarted:Boolean = false;
        public var _SOUND:SoundStub;

        public function NP9GamingSystemStub() {
            super();
            _SOUND = new SoundStub();
        }

        public function init(gameData:Object, debug:Boolean = false):void {
            _gameData = gameData;
        }

        public function callTranslation():void {}

        public function translationComplete():Boolean {
            return true;
        }

        public function getTranslation(key:String):String {
            return "";
        }

        public function setTextField(tf:Object, key:String):void {}

        public function sendScore(score:Number, prizeLevel:Number = 0):void {
            _restarted = false;
            var self:NP9GamingSystemStub = this;
            setTimeout(function():void {
                self._restarted = true;
                self.dispatchEvent(new Event(RESTART_CLICKED));
            }, 1500);
        }

        public function sendTag(event:String):void {}

        public function createEvar(initial:*):EvarStub {
            return new EvarStub(initial);
        }

        public function addSendScoreVar(name:String, value:*):void {}
        public function setSendScoreVar(name:String, value:*):void {}
        public function getSendScoreVar(name:String):Object { return null; }

        public function userClickedRestart():Boolean { return _restarted; }

        public function getFlashParam(key:String):String {
            if (_gameData == null) return "";
            var val:* = _gameData[key];
            if (val == null && _gameData["objAddVars"] != null)
                val = _gameData["objAddVars"][key];
            return val != null ? String(val) : "";
        }

        public function getImageServer():String {
            return _gameData != null ? String(_gameData["FG_GAME_BASE"]) : "";
        }

        public function getScriptServer():String {
            return _gameData != null ? String(_gameData["FG_SCRIPT_BASE"]) : "";
        }

        public function setFont(name:String):void {}
        public function addFont(font:Object, name:String):void {}
        public function isWesternLang():Boolean { return true; }
    }
}
