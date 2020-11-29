function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length == 2) return parts.pop().split(";").shift();
}
if (!getCookie("name") || !getCookie("pass")) {
    window.location.href = "/register?redirectTo=maths";
}
// INITIAL //
//general
var c = document.getElementById("c");
var ctx = c.getContext("2d");
var running;
var running = true;
var questionFontSize = 80;
//background fade
var showBackground = true;
var hidingBackground = 0;
var showingBackground = 0;
//questions + answers
var question;
var answers;
var correct;
//score
var numbCorrect = 0;
var percent;
var currentQuestion = 0;
//animations
var goalAnimation = 5000;
var wrongAnimation = 4000;
var shortAnimation = 70;
var answerWasCorrect;
var ball = {};
//skip variables
var skipGoalAnimation = false; //shouldn't change manually, even if always skip is enabled
var alwaysSkip = false;
//results
var showResults = 0;
//feedback
var endScreen = false;
const compliments = ["Outstanding", "Nice", "Excellent", "Superb", "Amazing", "Awesome"];
const neutral = ["Good", "OK", "Average", "Acceptable", "Satisfactory", "Alright"];
const insults = ["Disgusting", "Horrible", "Brainless", "Dreadful", "Horrendous", "Shocking"];
const identifiers = ["Performance", "Thinking", "Job", "Work", "Skills", "Speed"];
//hint
var hintCountdown = 0;
var combo = 0;
var hintPointsPercent = 0;
var removedBalls = [];
var ballRemoveOpacity = 0;
//images
function loadImage(loc) {
    let img = new Image();
    img.src = "../assets/" + loc;
    return img;
}
var assets = {
    bg: loadImage("bg.png"),
    ball: loadImage("ball.png")
};
setInterval(function() {
    if (hintCountdown > 0 && goalAnimation === 5000 && !ball.moveSpeed) {
        hintCountdown--;
    } else if (hintCountdown === 0) {
        combo = 0;
    }
}, 1);
function giveFeedback() {
    percent = (numbCorrect / maxQuestions)*100;
    if (percent < 33) {
        feedback = insults[Math.floor(Math.random()*6)] + " " + identifiers[Math.floor(Math.random()*6)];
    } else if (percent < 99) {
        feedback = neutral[Math.floor(Math.random()*6)] + " " + identifiers[Math.floor(Math.random()*6)];
    } else {
        feedback = compliments[Math.floor(Math.random()*6)] + " " + identifiers[Math.floor(Math.random()*6)];
    }
    showResults = 1;
    setTimeout(function(){showBackground = false}, 3);
}
// MAIN DRAWING LOOP //
function main() {
    //BACKGROUND ELEMENTS
    if (running) window.requestAnimationFrame(main);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(assets.bg, 0, 0, c.width, c.height);
    if (showBackground) { //showBackground is for optimization, it won't draw the background at 0 opacity
        if (hidingBackground) {
            ctx.globalAlpha = hidingBackground;
            hidingBackground -= 0.05;
            if (hidingBackground <= 0) {
                showBackground = false;
                hidingBackground = 0;
            }
        }
        if (showingBackground) {
            ctx.globalAlpha = 1 - showingBackground;
            showingBackground -= 0.05;
            if (showingBackground <= 0) {
                showingBackground = 0;
            }
        }
        //elipse
        ctx.beginPath();
        ctx.fillStyle = "#90909090";
        ctx.ellipse(c.width/ 2, 0, 1100, 200, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.closePath();
        //balls
        ctx.font = "60px Comfortaa";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        if (ballRemoveOpacity > 0) {
            ballRemoveOpacity -= 0.05;
        }
        //sometimes float conversion makes the number less than 0, this fixes it
        if (ballRemoveOpacity < 0) {
            ballRemoveOpacity = 0;
        }
        let prevAlpha = ctx.globalAlpha;
        for (i=0; i<5; i++) {
            ctx.globalAlpha = prevAlpha;
            if (removedBalls.indexOf(i) !== -1) {
                ctx.globalAlpha = ballRemoveOpacity;
            }
            ctx.drawImage(assets.ball, 408*i+50, c.height-300);
            ctx.rotate(320 * Math.PI / 180);
            ctx.fillText(answers[i], -400+(312*i), 880+(262*i));
            ctx.rotate((360 - 320) * Math.PI / 180);
        }
        ctx.globalAlpha = prevAlpha;
        //question text
        ctx.beginPath();
        ctx.font = questionFontSize+"px Comfortaa";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText(question, c.width / 2, 120);
        ctx.closePath();
        //hint countdown
        ctx.beginPath();
        ctx.fillStyle = "gray";
        ctx.fillRect(10, 340, 60, 400);
        ctx.fillStyle = "gold";
        ctx.fillRect(10, 340, 60, (hintCountdown / 1000)*400);
        ctx.closePath();
        //combo
        ctx.font = "40px Comfortaa";
        ctx.fillStyle = "white";
        ctx.fillText(combo, 40, 315);
        //question number
        ctx.textAlign = "left";
        ctx.fillText(currentQuestion + " / " + maxQuestions + "  " + Math.round(((numbCorrect+1) / currentQuestion)*100) + "%", 20, 60);
        //hint circle
        if (showBackground) {
            ctx.fillStyle = "#4b5162";
            ctx.beginPath();
            ctx.arc(1980, 515, 50, 0, 2 * Math.PI);
            ctx.fill();
            ctx.closePath();
            //inner
            ctx.strokeStyle = "gold";
            ctx.lineWidth = "8";
            ctx.beginPath();
            ctx.arc(1980, 515, 30, 1.5*Math.PI, (hintPointsPercent / 100) * (2 * Math.PI) + 1.5*Math.PI);
            ctx.stroke();
            ctx.closePath();
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("?", 1980, 518);
        }
    }
    ctx.globalAlpha = 1;
    //GOAL ANIMATION
    ctx.lineWidth = "10";
    ctx.strokeStyle = "#4b5162";
    if (goalAnimation < 5000) {
        if (goalAnimation < 500) {
            //start point
            ctx.moveTo(520, 290);
            //go down animation
            ctx.lineTo(520, 290+goalAnimation);
        } else if (goalAnimation < 1500) {
            //draw previous lines
            ctx.moveTo(520, 290);
            ctx.lineTo(520, 790);
            //new: go right animation
            ctx.lineTo(goalAnimation+20, 790);
        } else if (goalAnimation < 2000) {
            //draw previous lines
            ctx.moveTo(520, 290);
            ctx.lineTo(520, 790);
            ctx.lineTo(1520, 790);
            //new: go up animation
            ctx.lineTo(1520, 790-(goalAnimation-1500));
        } else if (goalAnimation < 3000) {
            //draw previous lines
            ctx.moveTo(520, 290);
            ctx.lineTo(520, 790);
            ctx.lineTo(1520, 790);
            ctx.lineTo(1520, 290);
            //new: go left animation
            ctx.lineTo(1520-(goalAnimation-2000), 290);
        } else if (goalAnimation < 3300) {
            //draw previous lines
            ctx.beginPath();
            ctx.moveTo(520, 290);
            ctx.lineTo(520, 790);
            ctx.lineTo(1520, 790);
            ctx.lineTo(1520, 290);
            ctx.lineTo(515, 290);
            //draw goal text
            ctx.textBaseline = "middle";
            ctx.textAlign = "center";
            ctx.font = "150px Comfortaa";
            ctx.fillStyle = "#ffffff";
            //new: draw center concentric box
            ctx.fillStyle = "#4b5162";
            ctx.rect(520 + (goalAnimation-3000), 290 + (goalAnimation-3000), 1000 - ((goalAnimation-3000)*2), 500 - ((goalAnimation-3000)*2));
            ctx.fill();
            ctx.closePath();
            goalAnimation -= 40;
        } else {
            ctx.beginPath();
            ctx.globalAlpha = 1 - ((goalAnimation-4100) / 900);
            //draw previous lines
            ctx.fillStyle = "#4b5162";
            ctx.fillRect(515, 285, 1010, 510);
            //draw goal text
            ctx.textBaseline = "middle";
            ctx.textAlign = "center"
            ctx.font = "150px Comfortaa";
            ctx.fillStyle = "white";
            ctx.fillText("G  O  A  L", 1020, 540, 1000);
            ctx.globalAlpha = 1;
            ctx.closePath();
            if (goalAnimation === 4950) {
                currentQuestion++;
                getQuestion();
                showBackground = true;
                showingBackground = 1;
            }
        }
        //put lines on the canvas
        ctx.stroke();
        //adjust animation speed (higher number = higher speed)
        goalAnimation += 50;
    }
    //INCORRECT ANIMATION
    if (wrongAnimation < 4000) {
        ctx.textBaseline = "middle";
        ctx.textAlign = "center"
        ctx.font = "60px Comfortaa";
        if (wrongAnimation < 540) {
            ctx.fillStyle = "#4b5162";
            ctx.fillRect(800, c.height-wrongAnimation-100, 440, 200);
            ctx.fillStyle = "white";
            ctx.fillText("Missed", 1020, c.height-wrongAnimation);
        } else {
            if (wrongAnimation === 540) wrongAnimation = 1000;
            ctx.globalAlpha = 1 - ((wrongAnimation-3100) / 900);
            if (wrongAnimation%1000>500) {
                ctx.fillStyle = "red";
            } else {
                ctx.fillStyle = "#4b5162";
            }
            ctx.fillRect(800, (c.height / 2)-100, 440, 200);
            ctx.fillStyle = "white";
            ctx.fillText("Missed", 1020, 540);
            ctx.globalAlpha = 1;
            if (wrongAnimation === 3980) {
                currentQuestion++;
                getQuestion();
                showBackground = true;
                showingBackground = 1;
            }
        }
        wrongAnimation += 20;
    }
    //SHORT ANIMATION (shown if skip animations is enabled)
    if (shortAnimation < 70) {
        ctx.fillStyle = "#4b5162";
        ctx.globalAlpha = 1-(shortAnimation / 70);
        ctx.fillRect(800, (c.height / 2)-100, 440, 200);
        ctx.textBaseline = "middle";
        ctx.textAlign = "center"
        ctx.font = "60px Comfortaa";
        ctx.fillStyle = "white";
        if (answerWasCorrect) {
            ctx.fillText("Goal", 1020, 540);
        } else {
            ctx.fillText("Missed", 1020, 540);
        }
        ctx.globalAlpha = 1;
        shortAnimation++;
    }
    //MOVING BALL
    if (ball.moveSpeed) {
        ball.x += ball.moveSpeed.x;
        ball.y += ball.moveSpeed.y;
        if (ball.y < -30) {
            ball = {};
            if (!skipGoalAnimation) {
                if (answerWasCorrect) {
                    goalAnimation = 0;
                } else {
                    wrongAnimation = 0;
                }
            } else {
                skipGoalAnimation = false;
            }
        } else {
            //increase speed (linear)
            if (ball.x > (1020+180)) {
                ball.moveSpeed.x -= 0.1;
            } else if (ball.x < (1020-400)) {
                ball.moveSpeed.x += 0.1;
            }
            ball.moveSpeed.y -= 0.1;
            ball.size -= 2.7;
            ctx.drawImage(assets.ball, ball.x, ball.y, ball.size, ball.size);
        }
    }
    //RESULTS PANEL
    if (showResults) {
        //box
        ctx.globalAlpha = showResults / 100;
        ctx.fillStyle = "#90909090";
        ctx.fillRect(0,0,c.width,c.height);
        ctx.fillStyle = "#4b5162";
        ctx.fillRect(200,200,c.width-400,c.height-400);
        //initial styleing
        ctx.fillStyle = "white";
        ctx.font = "60px Comfortaa";
        ctx.textBaseline = "middle";
        //stars
        let rot = Math.PI / 2 * 3;
        let step = Math.PI / 5;
        for (let s=-1; s<2; s++) {
            cx = (c.width / 2) + 300*s;
            ctx.beginPath();
            ctx.moveTo(cx, 100);
            for (let g = 0; g < 5; g++) {
                x = cx + Math.cos(rot) * 150;
                y = 200 + Math.sin(rot) * 150;
                ctx.lineTo(x, y)
                rot += step
        
                x = cx + Math.cos(rot) * 75;
                y = 200 + Math.sin(rot) * 75;
                ctx.lineTo(x, y)
                rot += step
            }
            ctx.lineTo(cx, 50);
            ctx.closePath();
            if (s < Math.floor(percent / 33)-1 && s<((showResults-500) / 333)-2) {
                ctx.fillStyle = "gold";
            } else {
                ctx.fillStyle = "grey";
            }
            ctx.fill();
        }
        //progress bar
        ctx.fillStyle = "grey";
        ctx.fillRect(520, 330, 1000, 30);
        if (showResults > 500) {
            ctx.fillStyle = "gold";
            if (showResults-500 > 1000 - (1000 - (percent*10))) {
                ctx.fillRect(520, 330, 1000 - (1000 - (percent*10)), 30);
                if (percent < 33) {
                    ctx.fillStyle = "red";
                } else if (percent < 99) {
                    ctx.fillStyle = "white";
                } else {
                    ctx.fillStyle = "gold";
                }
                ctx.fillText(feedback, 1020, 540);
                ctx.fillStyle = "#383c4a";
                ctx.fillRect(720, 700, 250, 125);
                ctx.fillRect(1070, 700, 250, 125);
                ctx.fillStyle = "white";
                ctx.font = "30px Comfortaa";
                ctx.fillText("Play Again", 845, 762.5);
                ctx.fillText("Home", 1195, 762.5);
                endScreen = true;
            } else {
                ctx.fillRect(520, 330, showResults-500, 30);
            }
        }
        //adjust speed
        showResults += 7;
    }
}

// WHEN CANVAS CLICKED //
c.addEventListener("click", function(e) {
    //get real click location after resizing
    bounds = c.getBoundingClientRect();
    click = {};
    click.x = e.x - bounds.left;
    click.y = e.y - bounds.top;
    click.x /= bounds.width;
    click.y /= bounds.height;
    click.x *= 2040;
    click.y *= 1080;
    //If click.y is in ball y range
    if (click.y > 815 && click.y < 1043 && 
    !ball.moveSpeed && goalAnimation === 5000 && wrongAnimation === 4000 && !endScreen) {
        for (let c=0; c<5; c++) {
            //determine ball number clicked
            if (click.x > (408*c)+90 && click.x < (408*c)+320) {
                removedBalls = [];
                if (c === correct) {
                    combo++;
                    answerWasCorrect = true
                    numbCorrect++;
                    hintPointsPercent += combo**2;
                    hintCountdown = 1000;
                } else {
                    answerWasCorrect = false;
                    hintCountdown = 0;
                }
                if (alwaysSkip) {
                    shortAnimation = 0;
                    currentQuestion++;
                    getQuestion();
                    showBackground = true;
                    return;
                }
                hidingBackground = 1;
                if (c === correct) {
                    //CORRECT
                    //initial ball move speed, will increase linearly
                    ball = {
                        x: 408*c+50,
                        y: 780,
                        moveSpeed: {
                            x: (1020-408*c+50) / 200,
                            y: (215-780) / 200
                        },
                        size: 300
                    }                    
                } else {
                    //INCORRECT
                    //miss goals
                    let moveTo = Math.random()*2040;
                    while (Math.abs(moveTo - 1040) < 300) {
                        if (Math.random() > 0.5) {
                            moveTo += 500; 
                        } else {
                            moveTo -= 500; 
                        }
                    }
                    ball = {
                        x: 408*c+50,
                        y: 780,
                        moveSpeed: {
                            x: (moveTo-((408*c)+50)) / 200,
                            y: (215-780) / 200
                        },
                        size: 300
                    }  
                }
                //exit
                break;
            }
        }
    }
    if (showResults && click.y > 700 && click.y < 825) {
        if (click.x > 720 && click.x < 970) {
            window.location.reload();
        } else if (click.x > 1070 && click.x < 1320) {
            window.location.href = "/maths"
        }
    }
    if (hintPointsPercent > 99 && click.x > 1930 && click.y > 465 && click.x < 2030 && click.y < 565) {
        hintPointsPercent = 0;
        let canRemove = [];
        for (let j=0; j<5; j++) {
            if (correct !== j) canRemove.push(j);
        }
        removedBalls = []
        for (j=0; j<2; j++) {
            let removing = Math.floor(Math.random()*canRemove.length);
            removedBalls.push(canRemove[removing]);
            canRemove.splice(removing, 1);
            ballRemoveOpacity = 1;
        }
    }
});
//skip animation
window.addEventListener("keydown", function(key) {
    if (key.code === "Escape") {
        if (goalAnimation < 5000) {
            goalAnimation = 5000;
        } else if (wrongAnimation < 4000) {
            wrongAnimation = 4000;
        } else if (ball.moveSpeed) {
            ball.y = -100;
            skipGoalAnimation = true;
        } else {
            return;
        }
        currentQuestion++;
        getQuestion();
        showBackground = true;
        hidingBackground = 0;
        showingBackground = 1;
    }
});
//start program when loaded
window.onload = function() {
    document.getElementById("loader").style.display = "none";
    currentQuestion++;
    getQuestion();
    main();
}