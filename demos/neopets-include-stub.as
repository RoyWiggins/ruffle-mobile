this.getBytesLoaded = function()
{
   return 9999;
};
this.getBytesTotal = function()
{
   return 9999;
};
if(_global.NPTranslator != undefined)
{
   _global.NPTranslator.onLoadHandler = function(evt)
   {
   };
}
this.onEnterFrame = function()
{
   if(_level0._NP8_objLB != undefined)
   {
      _level0._NP8_objLB.gameTranslationSuccess = true;
      this.onEnterFrame = undefined;
   }
};
include = new Object();
include.reset = function()
{
};
include.NeoStatus = function()
{
   this.sendTag = function(tag)
   {
   };
};
include.evar = function(initial, name, desc)
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
include.resetvar = include.evar;
include.ScoringSystem = function(weight)
{
   this.weight = weight;
   this.value = 0;
   this.reset = function()
   {
      this.value = 0;
   };
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
   this.send = function()
   {
   };
   this.submit = function()
   {
   };
   this.Evar = _level100.include.evar;
   this.evar = _level100.include.evar;
};
include.translator = new Object();
include.translator.setDefaultFont = function(f)
{
};
include.translator.addTextField = function(target, params)
{
   if(target == undefined)
   {
      return target;
   }
   target.embedFonts = false;
   target.html = true;
   var baked = target.text;
   var hasBaked = baked != undefined && String(baked).length > 0;
   if(!hasBaked && params != undefined)
   {
      if(params.htmlText != undefined)
      {
         target.htmlText = params.htmlText;
      }
      else if(params.text != undefined)
      {
         target.text = params.text;
      }
   }
   target.setHtmlText = function(html)
   {
      var baked = this.text;
      if(baked == undefined || String(baked).length == 0)
      {
         this.htmlText = html;
      }
   };
   target.setText = function(t)
   {
      var baked = this.text;
      if(baked == undefined || String(baked).length == 0)
      {
         this.text = t;
      }
   };
   return target;
};
include.gameMsg = function(a, b)
{
};
include.gameTranslationSuccess = true;
include.preloaderTranslationSuccess = true;
include.newGameTranslation = function()
{
};
include.initScoringMeter = function()
{
};
include.setTranslatorTextFieldTarget = function(target)
{
   if(target == undefined)
   {
      return undefined;
   }
   target.__resolve = function(name)
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
};
include._NP8_GAME_DATA = new Object();
include.setGameData = function(key, val)
{
   this._NP8_GAME_DATA[key] = val;
};
include.setGameDataAdd = function(key, subkey, val)
{
   if(this._NP8_GAME_DATA[key] == undefined)
   {
      this._NP8_GAME_DATA[key] = new Object();
   }
   this._NP8_GAME_DATA[key][subkey] = val;
};
include._NP8_ScoringSystem = new Object();
include._NP8_ScoringSystem.value = 0;
include._NP8_ScoringSystem.reset = function()
{
   this.value = 0;
};
include._NP8_ScoringSystem.changeby = function(n)
{
   this.value += n;
};
include._NP8_ScoringSystem.changeto = function(n)
{
   this.value = n;
};
include._NP8_ScoringSystem.show = function()
{
   return this.value;
};
include._NP8_ScoringSystem.send = function()
{
};
include._NP8_ScoringSystem.submit = function()
{
};
include._NP8_ScoringSystem.submitScore = function(weight)
{
   _level100.include.bScoringMeterClick = true;
};
include._NP8_NeoStatus = new Object();
include._NP8_NeoStatus.sendTag = function(tag)
{
};
include.bScoringMeterClick = false;
include.createSystemObjects = function(bDictionary)
{
   _level0.__resolve = function(name)
   {
      if(typeof name != "string")
      {
         return undefined;
      }
      if(name.substring(0,4) == "IDS_")
      {
         var k = name.substring(4);
         if(k.indexOf("_OPEN") >= 0 || k.indexOf("_CLOSE") >= 0)
         {
            return "";
         }
         return k.split("_").join(" ");
      }
      if(name.substring(0,4) == "FGS_")
      {
         return name.substring(4).split("_").join(" ");
      }
      if(name.substring(0,6) == "ttext_")
      {
         return name.substring(6).split("_").join(" ");
      }
      return undefined;
   };
   if(_level0._NP8_objLB != undefined)
   {
      _level0._NP8_objLB.gameTranslationSuccess = true;
   }
   if(_global.NPTranslator != undefined)
   {
      _global.NPTranslator.onLoadHandler = function(evt)
      {
      };
      _global.NPTranslator.translate = function()
      {
         var evt = new Object();
         evt.type = "onLoad";
         evt.success = "true";
         evt.target = this;
         this.dispatchEvent(evt);
      };
   }
};
