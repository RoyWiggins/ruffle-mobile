package {
    public class EvarStub {
        private var _value:*;

        public function EvarStub(initial:*) {
            _value = initial;
        }

        public function changeTo(v:*):void  { _value = v; }
        public function changeBy(v:Number):void { _value = Number(_value) + v; }
        public function show():* { return _value; }
    }
}
