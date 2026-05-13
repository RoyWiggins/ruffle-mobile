loadMovieNum("http://images.neopets.com/games/gaming_system/np6_include_v1.swf",100);
_root.Evar = function(initial, name, desc)
{
   this.value = initial;
   this.changeby = function(n)
   {
      this.value += n;
   };
   this.changeto = function(n)
   {
      this.value = n;
   };
   this.show = function()
   {
      return this.value;
   };
};
_root.evar = _root.Evar;
_level0.__resolve = function(name)
{
   if(typeof name == "string")
   {
      if(name.substring(0,4) == "IDS_")
      {
         return name.substring(4).split("_").join(" ");
      }
      if(name.substring(0,6) == "ttext_")
      {
         return name.substring(6).split("_").join(" ");
      }
   }
};
this.bios_done = false;
this.onEnterFrame = function()
{
   if(this.bios_done)
   {
      return undefined;
   }
   if(_level100.include != undefined && _level100.include.translator != undefined)
   {
      this.bios_done = true;
      _level100.include.setTranslatorTextFieldTarget(_level0);
      _level0.resetall = function()
      {
         _level100.include.reset();
      };
      _level0.resetvar = _level100.include.resetvar;
      _level0.evar = _level100.include.evar;
      _parent._parent.play();
      this.onEnterFrame = undefined;
   }
};
