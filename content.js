	var errors = [];
	var errText="";
	var errorsLimit = 100;
	var timer;
	function download(filename, text) {
		var element = document.createElement('a');
		element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
		element.setAttribute('download', filename);
	  
		element.style.display = 'none';
		document.body.appendChild(element);
	  
		element.click();
	  
		document.body.removeChild(element);
	  }
	function handleNewError(error) {
		var lastError = errors[errors.length - 1];
		var isSameAsLast = lastError && lastError.text == error.text && lastError.url == error.url && lastError.line == error.line && lastError.col == error.col;
		var isWrongUrl = !error.url || error.url.indexOf('://') === -1;
		if(!isSameAsLast && !isWrongUrl) {
			errors.push(error);
			if(errors.length > errorsLimit) {
				errors.shift();
			}
			if(!timer) {
				timer = window.setTimeout(function() {
					timer = null;
					chrome.runtime.sendMessage({
						_errors: true,
						errors: errors,
					});
				}, 200);
			}
		}
	}
	function returnErrors()
	{
		download('test.txt', chrome.storage.local.get(['errorText']));
	}
	document.addEventListener('ErrorToExtension', function(e) {
		var error = e.detail;
		errText+=JSON.stringify(error);
		chrome.storage.local.set({'errorText': errText});
		handleNewError(error);
	});
	function codeToInject() {

		function handleCustomError(message, stack) {
			if(!stack) {
				stack = (new Error()).stack.split("\n").splice(2, 4).join("\n");
			}

			var stackLines = stack.split("\n");
			var callSrc = (stackLines.length > 1 && (/^.*?\((.*?):(\d+):(\d+)/.exec(stackLines[1]) || /(\w+:\/\/.*?):(\d+):(\d+)/.exec(stackLines[1]))) || [null, null, null, null];

			document.dispatchEvent(new CustomEvent('ErrorToExtension', {
				detail: {
					stack: stackLines.join("\n"),
					url: callSrc[1],
					line: callSrc[2],
					col: callSrc[3],
					text: message
				}
			}));
		}

		// handle uncaught promises errors
		window.addEventListener('unhandledrejection', function(e) {
			if (typeof e.reason === 'undefined') {
				e.reason = e.detail;
			}
			handleCustomError(e.reason.message, e.reason.stack);
		});

		// handle console.error()
		var consoleErrorFunc = window.console.error;
		window.console.error = function() {
			var argsArray = [];
			for(var i in arguments) { // because arguments.join() not working! oO
				argsArray.push(arguments[i]);
			}
			consoleErrorFunc.apply(console, argsArray);

			handleCustomError(argsArray.length == 1 && typeof argsArray[0] == 'string' ? argsArray[0] : JSON.stringify(argsArray.length == 1 ? argsArray[0] : argsArray));
		};

		// handle uncaught errors
		window.addEventListener('error', function(e) {
			if(e.filename) {
				document.dispatchEvent(new CustomEvent('ErrorToExtension', {
					detail: {
						stack: e.error ? e.error.stack : null,
						url: e.filename,
						line: e.lineno,
						col: e.colno,
						text: e.message
					}
				}));
			}
		});
		
		// handle 404 errors
		window.addEventListener('error', function(e) {
			var src = e.target.src || e.target.href;
			var baseUrl = e.target.baseURI;
			if(src && baseUrl && src != baseUrl) {
				document.dispatchEvent(new CustomEvent('ErrorToExtension', {
					detail: {
						is404: true,
						url: src
					}
				}));
			}
		}, true);
		//return errors[0];
	}

	var script = document.createElement('script');
	script.textContent = '(' + codeToInject + '())';
	(document.head || document.documentElement).appendChild(script);
	script.parentNode.removeChild(script);
