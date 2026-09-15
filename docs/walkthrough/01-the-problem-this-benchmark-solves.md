<a id="part-1"></a>
## 1. The problem this benchmark solves

> **In this chapter.** Why a car cannot measure how full its battery is, what a drive cycle is and why the lab recorded so many of them, what "error" means when we score a model, and why some of the data is kept secret.

### 1.1 A gauge that cannot be read

A petrol car has a float in the tank. An electric car has nothing like it. The amount of charge left in a battery, which engineers call the **state of charge** or **SOC** and express as a percentage from empty to full, is not something any sensor can read directly. What the car *can* measure, many times a second, is the current flowing in and out of the battery, the voltage across it, and its temperature. From those three signals it has to work out the state of charge, and that calculation is the job of an **estimator**: an algorithm running on the car's battery computer.

![Figure 1.1. The state of charge cannot be measured, only estimated. A car's estimator turns three measurable signals into the number on the dashboard.](figures/fig-gauge.png)

Getting the estimate wrong has real consequences. A gauge that reads high strands drivers with a battery that was emptier than it said; a gauge that reads low forces the carmaker to hide part of the battery as a safety margin, so the driver paid for range they can never use. Estimators also have a habit of working well in the lab at room temperature and drifting badly in a Canadian winter. A great deal of research therefore goes into making them better, and that research is what this benchmark is for.

### 1.2 Drive cycles: the data

A **drive cycle** is a recording of a standard kind of trip. It says how fast a car goes, second by second, through a fixed pattern of driving. Some cycles are stop-and-go city traffic, some are steady highway, some are aggressive with hard acceleration and braking. The car industry has used the same handful of these for decades to measure fuel economy, so they are well known and repeatable. The standard ones in this benchmark are UDDS (urban), HWFET (highway), LA92 and US06 (both aggressive); the lab added two of its own, HWCUST and HWGRADE, which have never been published.

For the benchmark the lab took real Tesla 2170 cells, the cylindrical cells used in the Model 3, and put each one through those trips inside a thermal chamber. At every moment the test equipment drew exactly the current a Model 3 would draw from that cell: heavy current when the car accelerates, current flowing back in when it brakes, nothing when it idles. Voltage, temperature and the true state of charge were recorded the whole time. Figure 1.2 shows what one such recording looks like.

![Figure 1.2. Two hours of one drive cycle from the open data. The current swings with every acceleration and braking event, the voltage sags and recovers with it, and the true state of charge falls slowly from full. A model sees only the top two traces and the temperature; it has to produce the third.](figures/fig-drive-cycle.png)

Every cycle was repeated at six temperatures from −20 °C to 40 °C, because a cold cell behaves very differently from a warm one, and on four cells that had each been driven with a different payload (one passenger, a full load with the air conditioning on or off, and a trailer). That is what makes the data valuable: a model is judged on the messy, realistic loads a battery sees in a car, at the cold temperatures where estimators usually fail, and, because the true state of charge was recorded, every guess it makes can be checked exactly.

### 1.3 Error: what is measured

For every second of every drive cycle the lab knows the true state of charge. The model, seeing only current, voltage and temperature, produces its own guess for the same second. The difference between the two is the **error**, and it is the one thing the benchmark measures. Everything on the leaderboard is some average of it.

![Figure 1.3. The error is the gap between the model's estimate and the truth. Here a simple model with a faulty current sensor drifts steadily away from the real state of charge; the shaded band is what the benchmark scores.](figures/fig-error.png)

To turn two hours of error into one number the benchmark uses the **root-mean-square error**, or **RMSE**: square the error at every second, average the squares, take the square root. Being 2 % off all the time gives an RMSE of 2. Being perfect except for one bad minute scores worse than that minute's share would suggest, because the squaring punishes large errors. That is deliberate: a model that is always slightly off is more useful in a car than one that is usually perfect and occasionally wildly wrong.

Where the error happens matters as much as its size. A model that works at 25 °C and drifts at −20 °C is not much use in Canada, and a model that is accurate only when it is told the exact starting charge is not much use either, because a real car does not know it. So the score does not just average the error; it looks at each temperature, each cell and each kind of trip separately, and it also runs the model with a deliberately wrong starting point and a deliberately faulty current sensor. Chapter 5 shows exactly how those pieces combine.

### 1.4 Open data and hidden data

The obvious way to test a model would be to publish all the data and let everyone report their own numbers. The trouble is that every group would test on its own choice of cycles with its own definition of error, and a claimed 1.5 % could not be compared with someone else's 2 %. Worse, a model trained on the published data can simply memorise it and look far better than it is.

![Figure 1.4. The open data is for building models; the hidden data is for scoring them. The m448 cell exists only on the evaluation machine.](figures/fig-openhidden.png)

The benchmark therefore splits the data in two. The **open data**, published on the Borealis research repository, contains the characterisation tests and drive cycles for three of the four cells. Researchers build and train on it freely. The **hidden data** contains the whole fourth cell, m448, plus cycles and conditions the open set does not include. It has never been published and it never touches the website. Every submitted model is scored on the hidden data, so no model can have seen it, and the leaderboard shows the hidden-cell score next to the open-cell score. A model that does well on the open cells and badly on the hidden one has memorised rather than learned.

### 1.5 What the benchmark promises

Put together, the promise is simple. Everyone gets the same test: the same hidden data, the same code computing the same error, the same published weights turning the errors into one score. A researcher uploads their estimator as a small program, one Python or MATLAB file zipped together with whatever parameters it needs, and a few minutes later has a score on a public leaderboard that means the same thing as everyone else's. The uploaded program is deleted the moment it has been scored.

