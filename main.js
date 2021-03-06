var searchResults = [];

var resultsParent;
var queueParent;

var audio = null;
var source = null;

var volumeTimer = null;
var volumeFadeDelay = 250;
var volumeFadeTime = 125;

var connectionCheckRate = 15000;

var queue = [];
var playing = false;

var youtubeUrlRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?(?:.*)v=|v\/)([\w\-]+)/;

var serverCookie = "gotube_ip";
var portCookie = "gotube_port";
var volumeCookie = "gotube_volume";
var playerCookie = "gotube_player";

var version;

var modalFadeTime = 175;

/* === prototypes & extention methods === */
Date.time = function() {
    return + new Date();
}

Number.prototype.clamp = function(min, max) {
  return Math.min(Math.max(this, min), max);
};

Number.prototype.toRandom = function() {
    var x = Math.sin(this) * 1337;
    return x - Math.floor(x);
}

/* === window methods === */
function setTitle(newTitle) {
    if (document.title != newTitle) {
        document.title = newTitle;
    }
}

function setIcon(newIcon) {
    $("#favicon").attr("href", "icons/" + newIcon + ".png");
}

function updateTitle() {
    if (queue.length == 0) {
        setTitle("gotube");
        setIcon("loading");
    }
    else {
        setIcon((playing) ? "play" : "pause");
        currTitle = queue[0].title;
        setTitle("gotube - " + currTitle);
    }
}

function getSeed(stringSeed) {
    var acc = 0;
    for (var i = 0; i < stringSeed.length; i++) {
        acc *= 256;
        acc += stringSeed.charCodeAt(i);
    }
    return acc;
}

function updateColor() {
    var hue = 320;
    if (queue.length != 0) {
        var currentId = queue[0].id;
        currentId = currentId.replace('-', '+');
        currentId = currentId.replace('_', '/');
        var encodedData = window.atob(currentId);
        seed = getSeed(encodedData);
        hue = seed.toRandom() * 360;
    }
    $("body").get(0).style.setProperty("--accent", "hsl(" + hue + ", 42%, 50%)")
}

function updateSearchButton() {
    var query = $("#searchQuery").val();
    var buttonIcon = query.match(youtubeUrlRegex) ? "add" : "search";
    $("#searchButton").text(buttonIcon);
}


/* === playback methods === */
function loadUrl(url) {
    audio.trigger('pause');
    source.attr("src", url);
    audio.trigger('load');
    audio.prop('currentTime', 0);
    updateColor();
}

function playUrl(url) {
    loadUrl(url);
    audio.trigger('play');
}

function restart() {
    audio.trigger('pause');
    audio.prop('currentTime', 0);
    audio.trigger('play');
}

function loadVolume() {
    var level = Cookies.get(volumeCookie);
    if (level !== undefined) {
        setVolume(level);
        var range = Math.round(level * 100);
        $(".slider-holder input").prop("value", range);
    }
    else {
        setVolume(0.5)
        $(".slider-holder input").prop("value", 50);
    }
}

function setVolume(level) {
    resetVolumeTimer();

    level = Number(level).clamp(0, 1);
    audio.prop('volume', level * level);
    Cookies.set(volumeCookie, level);
    
    // fix bugs related to anti-autoplay features 
    if (playing) {
        audio.trigger('play');
    }

    var volumeIcon = $("#volumeLevel");
    if (level == 0) {
        volumeIcon.text("volume_off");
    }
    else if (level < 0.2) {
        volumeIcon.text("volume_mute");
    }
    else if (level < 0.6) {
        volumeIcon.text("volume_down");
    }
    else {
        volumeIcon.text("volume_up");
    }
}

function resetVolumeTimer() {
    if (volumeTimer != null) {
        clearTimeout(volumeTimer);
    }
    volumeTimer = setTimeout(hideVolumeSlider, volumeFadeDelay);
}

function loadTop(autoplay=false) {
    if (!queue || !queue.length)
        return;

    var apiAddr = getApiAddress();
    var idUrl = apiAddr + "/queue/top";
    
    // first get the id of the song at the top of the queue
    $.ajax({url:idUrl})
    .done(function (data) {
        var streamUrl = apiAddr + "/stream/" + data;

        if (autoplay) {
            playUrl(streamUrl);
        } else {
            loadUrl(streamUrl);
        }

        updateArtwork();
    })
    .fail(function () {
        alert("unable to get queue top");
    });
}

function updateArtwork() {
    var arturl = queue[0].thumbnail;

    var artwork = $("img.artwork");

    artwork.attr("src", arturl);
}

function loadServerDetails() {
    var address = Cookies.get(serverCookie);
    var port = Cookies.get(portCookie);
    if ( address != undefined && port != undefined ) {
        $("#serverAddress").val(address);
        $("#serverPort").val(port);
    }

    return `http://${address}:${port}`;
}

function saveServerDetails() {
    var address = $("#serverAddress").val();
    var port = $("#serverPort").val();
    Cookies.set(serverCookie, address)
    Cookies.set(portCookie, port);
    return address + ":" + port;
}

function clearServerDetails() {
    Cookies.remove(serverCookie);
    Cookies.remove(portCookie);
}

function hideModals() {
    hideConnectionSettings();
}

function showConnectionSettings() {
    hideVolumeSlider();
    $('.modal-hider').fadeIn(modalFadeTime);
    $('.config').fadeIn(modalFadeTime);
}

function hideConnectionSettings() {
    $('.modal-hider').fadeOut(modalFadeTime, loadServerDetails);
    $('.config').fadeOut(modalFadeTime);
}

function showVolumeSlider() {
    resetVolumeTimer();
    $('#volumeLevel').fadeTo(volumeFadeTime, 0);
    $('.slider-holder').fadeIn();
}

function hideVolumeSlider() {
    $('#volumeLevel').fadeTo(volumeFadeTime, 1);
    $('.slider-holder').fadeOut();
}

function updateVersion() {
    var subheader = $("header h2");
    var header = $("header");

    if (version == null) {
        subheader.text("[disconnected]");
        header.removeClass("connected");
    }
    else {
        subheader.text("v" + version);
        header.addClass("connected");
    }
}

function init() {
    $.ajax({
        url:getApiAddress() + "/version"
    })
    .done(function(data){
        var re = /^(?:gotube\/)((?:[0-9]+\.){2}[0-9]+)\s*$/;

        // check the server is a gotube server.
        if (!re.test(data)){
            showConnectionSettings();
            return;
        }

        version = data.match(re)[1];

        console.log(`connected to gotube v${version} on ${getApiAddress()}.`);
        updateVersion();

        saveServerDetails();
        updateQueue();
        startConnectionChecker();
    })
    .fail(function(){
        console.log("error: no connection.");
        showConnectionSettings();
    });
}

function getApiAddress() {
    var address = Cookies.get(serverCookie);
    var port = Cookies.get(portCookie);

    return `http://${address}:${port}`;
}

function loadNext(autoplay) {
    var url = getApiAddress() + "/queue/next";

    audio.trigger('pause');

    $.post({url:url})
    .done(function() { 
        updateQueue(autoplay);
    })
    .fail(function() {
        alert("unable to load next");
    });
}

function updateQueue(autoplay=false, update_only=false) {
    var url = getApiAddress() + "/queue";

    $.ajax({url: url})
    .done(function (data) {
        queue = JSON.parse(data);
        
        if (!queue || !queue.length) // queue is empty i guess 
            return;

        // clear whatever was already there
        queueParent.html("");

        for (var i = 0; i < queue.length; i++) {
            queueParent
                .append($("<li></li>")
                .append($("<a/>",
                {
                    text: queue[i].title,
                    class: "validated"
                })));
        }

        console.log("successfully loaded queue of length " + queue.length + ".");

        if (update_only) return;

        loadTop(autoplay);
    })
    .fail(function () {
        alert("error: unable to get queue");
    });
}

function searchHandler() {
    var query = $("#searchQuery").val();

    if (youtubeUrlRegex.test(query)) {
        var match = youtubeUrlRegex.exec(query);
        queueSong(match[1]);
        $("#searchQuery").val("");
    } 
    else {
        doSearch(query);
    }
}

function doSearch(query) {
    console.log("searching for : '" + query + "'"); 

    var url = getApiAddress() + "/search";
    var postData = JSON.stringify({
        query: query,
        maxResults: 10
    });

    $.post({
        url: url,
        data: postData
    })
    .done(function (data) {
        // clear previous results
        resultsParent.html("");

        // show the search term
        $(".search").removeClass("empty");
        $(".search h3").text(query);

        searchResults = JSON.parse(data);

        // create a list element with a button for each result
        for (var i = 0; i < searchResults.length; i++) {
            resultsParent
                .append($("<li></li>")
                .append($("<a/>", 
                {
                    text: searchResults[i].title,
                    id: i,
                    href: "#"
                })));
        }
    })
    .fail(function () {
        alert("search failed!");
    })
    .always(function () {
        console.log("search complete.");
    });
}

function addResultToQueue(id) {
    var youtubeId = searchResults[id]['id'];
    var title = searchResults[id]['title'];

    queueSong(youtubeId, title);
}

function addToQueue(id, title = null) {
    var validateInfo = (title == null);
    queueParent.append($("<li></li>")
    .append($("<a/>", 
    {
        text:   validateInfo ? "[Loading Info...]" : title,
        id:     "yt" + id,
        class:  "unvalidated" + ((validateInfo) ? " noinfo" : "")
    })));

    if (validateInfo) {
        var lookupUrl = getApiAddress() + "/info/" + id;
        $.get({url:lookupUrl})
        .done(function(data){
            validateQueueInfo(id, data)
        })
        .fail(function(){
            invalidateQueueItem(id);
        })
    }
}

function validateQueueInfo(id, data) {
    var elem = queueParent.find(".noinfo#yt" + id);
    var result = JSON.parse(data);
    elem.text(result.title);
    elem.removeClass("noinfo");
}

function validateQueueDownload(id, autoplay = false) {
    var elem = queueParent.find(".unvalidated#yt" + id);
    elem.addClass("validated");
    elem.removeClass("unvalidated");
    if (autoplay) {
        loadTop(true);
    }
}

function invalidateQueueItem(id) {
    var elem = queueParent.find(".unvalidated#yt" + id);
    elem.remove();
}

function queueSong(id, title = null) {
    var url = getApiAddress() + "/queue/add";
    var data = id;

    addToQueue(id, title);
    $.post({
        url: url,
        data: data
    })
    .done(function () {
        // if the queue was previously empty, automatically start playing.
        var newQueue = (queue.length == 0);
        if (newQueue) playing = true;
        validateQueueDownload(id, playing);
    })
    .fail(function (xhr) {
        invalidateQueueItem(id);
        alert(xhr.statusText);
    });
}

function startConnectionChecker() {
    setInterval(checkConnection, connectionCheckRate);
}

function checkConnection() {
    var url = getApiAddress() + "/ping";

    $.get({url: url})
    .done(function() {
        // NOTE: removed due to console spam.
        //console.log("ping successful.");
    })
    .fail(function() {
        console.log("connection lost! retrying...");
        location.reload();
    })
}

$(function() {
    // >>- global accessors -<< //
    audio = $("audio");
    source = $("audio source");

    resultsParent = $("#searchResults");
    queueParent = $("#queueParent");

    // >>- button click binds -<< //
    // search box
    $("#searchButton").click(searchHandler);

    $("#searchQuery").on('keyup', function (e) {
        if (e.keyCode == 13) {
            searchHandler();
        }
    });

    $("#searchQuery").on('input', updateSearchButton);

    // search results
    resultsParent.on("click", "li a", function () {
        var id = parseInt($(this).attr("id"));
        addResultToQueue(id);
    });

    // all modals
    $(".modal-hider").click(hideModals)

    // server config modal
    $("#configClose").click(hideConnectionSettings);

    $("#configSettings").click(showConnectionSettings);

    $("#configButton").click(function() {
        saveServerDetails();
        location.reload();
    });

    // volume slider
    $("#volumeLevel").click(showVolumeSlider);

    // queue
    $("#clearQueue").click(function () {
        var url = getApiAddress() + "/queue/clear";
        var postData = { index: -1 };

        // clear queue display
        queueParent.html("");

        $.post({ 
            url: url,
            data: JSON.stringify(postData)
        })
        .done(function () {
            console.log("server queue cleared."); 
        })
        .fail(function (xhr) {
            alert(xhr.statusText);
        });
    });

    // bottom bar buttons
    $(".play-pause").click(function() {
        if (playing) {
            audio.trigger('pause');
        } else {
            audio.trigger('play');
        }
    });

    $(".restart").click(restart);

    $(".skip").click(function() {
        loadNext(playing);
    });

    // >>- audio event binds -<< //
    audio.bind("pause", function() {
        playing = false;
        $(".play-pause").text("play_circle_filled");
        updateTitle();
    });
    
    audio.bind("play", function() {
        playing = true;
        $(".play-pause").text("pause_circle_filled");
        updateTitle();
    });

    audio.bind("ended", function() {
        loadNext(true);
        updateTitle();
    });

    // volume slider bind
    $('.slider-holder input').bind("input", function() {
        setVolume(this.value / 100);
    });

    $('.slider-holder').hover(
        function() {
            this.iid = setInterval(resetVolumeTimer, 25);
        }, 
        function() {
            this.iid && clearInterval(this.iid);
        }
    )

    // >>- initialization -<< //
    loadServerDetails();
    loadVolume();
    init();
});
