package {
    public class SoundStub {
        public function play(id:String, loops:int = 0, volume:Number = 1):void {}
        public function stop(id:String = ""):void {}
        public function pause(id:String = ""):void {}
        public function resume(id:String = ""):void {}
        public function setVolume(v:Number):void {}
        public function mute():void {}
        public function unmute():void {}
        public function isMuted():Boolean { return false; }
    }
}
