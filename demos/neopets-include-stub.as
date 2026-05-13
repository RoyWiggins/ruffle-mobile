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
