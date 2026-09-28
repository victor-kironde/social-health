# Scenario figures: eight synthetic lives

Screenshots of the app showing eight synthetic "lives" for the report. Each life has three images:

| File | Shows |
|---|---|
| `<id>-graph.png` | The network graph (rings view, type areas on, all relationships shown) |
| `<id>-summary.png` | The Social Health page: overall score, relationships by closeness band, comparison with the ideal, and the score's components |
| `<id>-trends.png` | The same page scrolled to **Trends** over **5 months**: Social Health over time, closeness bands per week, and catch-ups per week |

## How they were made

- **Data.** The data is synthetic, built by `packages/synth/src/lives.ts` and listed under "Lives" in `apps/mobile/src/data/scenarioCatalog.ts`.
- **History.** Each life has 300 days of history, and the story happens in the last five months.
- **Reproducible.** Every life uses a fixed random seed, so the data is the same each time.
- **Date and model.** Every life is scored as of **1 July 2026** with the default settings and model **v0.4.0**. That puts the 5-month trend window at 4 February to 1 July 2026.
- **Unnamed people.** The many people met at work, such as patients, pupils, customers and witnesses, are logged as **group catch-ups**. They count only as "others there (not named)", with no names stored.
- **Group membership.** Anyone who is named at a group catch-up is shown as a member of that group.
- **Device.** The screenshots were taken on a tablet emulator: Android 16 (API 36), 1600 × 2560 px at 320 dpi, in dark mode.
- **Retaking a screenshot.** Open `socialgraph://graph?scenario=<id>` or `socialgraph://score?scenario=<id>` on a device with the app installed.

**Reading the graph:**
- **Distance from "You":** shows importance.
- **Node size:** shows how much in touch the user is with that person or group.
- **Ring colour:** shows closeness. Green is close, amber is drifting, red is strained, grey is lost touch.
- **Rounded squares:** groups.
- **Shaded areas:** relationship types.
- **Faint lines:** link groups to their named members.
- **Hidden by default:** relationships marked in memoriam or archived, such as Margaret in the care home and the old team in "new in town".

## Summary

| Life (`id`) | Score now | 5-month trend (start → lowest → end) | People | Groups | Catch-ups logged | Unnamed others, last 5 months |
|---|---|---|---|---|---|---|
| Doctor (`doctor`) | 7 | 8 → 7 → 7 | 9 | 1 | 832 | 1,049 |
| Kindergarten teacher (`teacher`) | 9 | 9 → 8 → 9 | 8 | 3 | 903 | 2,343 |
| Waitress at a bar (`waitress`) | 7 | 7 → 6 → 7 | 8 | 1 | 732 | 2,030 |
| Trial lawyer (`lawyer`) | 7 | 8 → 6 → 7 | 8 | 2 | 802 | 773 |
| Elderly lady in a care home (`careHome`) | 8 | 9 → 8 → 8 | 7 | 2 | 828 | 681 |
| University student (`student`) | 8 | 8 → 7 → 8 | 8 | 2 | 651 | 352 |
| Parent of three (`parentOfThree`) | 9 | 9 → 9 → 9 | 9 | 1 | 1,135 | 453 |
| New in town (`newInTown`) | 8 | 9 → 6 → 8 | 7 | 3 | 335 | 669 |

People and Groups count every relationship in the scenario, including those now lost touch, archived or in memoriam.

## 1. A doctor (`doctor`)

A GP sees **6 to 14 new patients every weekday**. They are logged as one catch-up with the **Patients** group, counted but not named.

- **Returning patients:**
  - Grace (about monthly) and Tom (fortnightly since March) are named. That makes them group members and gives them their own nodes.
  - Edwin's weekly visits ended 60 days ago, so he now shows as lost touch.
- **Work and home:** a partner, Sam, and a nurse, Amara, are both marked as *living or working together*, so time apart counts much less.
- **Family:** weekly calls with Mum thin to fortnightly in the last ten weeks.
- **Friends:** Jo and Raj were seen fortnightly, then monthly. Raj stopped 70 days ago and is now lost touch.

**What the figures show:**
- Score now 7. The trend eases from 8 to 7 as work crowds out friends, even though catch-ups per week stay high, at around 20.
- The closeness bars gain grey (lost touch) over the period.

## 2. A kindergarten teacher (`teacher`)

- **The class:** about 20 children every school day, logged to **My class** and counted but not named. School holidays show as dips in catch-ups per week, in February, around Easter and in May.
- **Parents at the gate:** logged twice a week to **Class parents**.
  - Priya is a friendly parent.
  - Mark is rated *strained*, with an **ideal of 4**, meaning kept at a distance on purpose. He shows as Distant (4), which matches the ideal, so he does not pull the score down.
- **Work:** a close teaching assistant (Tess, works together, rated very good) and a weekly check-in with the head.
- **Life outside work:** a weekly choir, a partner at home, a sister on weekly video calls, and fortnightly brunch with friends.

**What the figures show:**
- Score 9, steady over the five months; it touches 8 only around the holidays.
- This is a busy but well-balanced network.

## 3. A waitress at a bar (`waitress`)

- **The regulars:** late shifts from Thursday to Saturday bring **20 to 45 regulars a night**, logged to **Bar regulars**.
  - Mick is a pushy regular, rated *strained*. Her **ideal for him is 2**, but because she sees him most shifts he sits at 4, closer than she would like.
  - Dee is a friendly regular.
- **Work:** she sees Jonno (bartender, works together) every shift. Rosa (manager) is rated *okay*.
- **Home:** Bea (flatmate) lives with her, and Mum gets messages twice a week plus a monthly visit.
- **Friends:** weekly weekend brunch with Tia and Marcus stopped five months ago when she took Saturday shifts. Tia is now seen every few weeks on a Monday, and Marcus has gone quiet.

**What the figures show:**
- Score 7, wavering between 6 and 8.
- The closeness bars carry a lot of amber and orange: many relationships are kept up, but loosely.
- The most catch-ups do not mean the closest network.

## 4. A trial lawyer (`lawyer`)

- **Work all week:** court twice a week, rising to every weekday during a **long trial from 100 days to 20 days ago**, with clerks and witnesses counted but not named. Client meetings twice a week.
- **Contentious relationships:**
  - Opposing counsel Mr Hale is rated *strained*, with an ideal of 3, and is met in court and emailed every other day.
  - Ms Reyes, a client, turns from *okay* to *strained* 40 days ago.
- **The trial's toll:**
  - At home, Alex lives with the lawyer and is rated *good*, then drops to *okay* at the height of the trial.
  - Monthly calls with Dad pause.
  - Friends Ben and Chloe are not seen during the trial. Ben is picked up again afterwards; Chloe is not.

**What the figures show:**
- The trend falls from 8 to 6 during the trial, then recovers to 7 when it ends.
- The closeness bars show the trial weeks dominated by drifting and distant relationships, with green returning at the end.
- This shows the score responding to a life event rather than just to how many catch-ups there are.

## 5. An elderly lady in a care home (`careHome`)

- **Daily company:** Joy, a carer, and Edith, a fellow resident. Both are marked *living together*.
- **Family:**
  - Carol (her daughter) visits every Sunday and calls on Wednesdays.
  - Peter (her son abroad, marked long distance) moves from monthly to every-other-month video calls.
  - Lily (her granddaughter) video-calls monthly.
  - Josh (her grandson) has not been in touch for about five months.
- **Groups:** **Bingo club** on Thursdays and **Sunday service**, each with many others there who are not named.
- **A loss:** her closest friend **Margaret**, who phoned weekly, died 75 days ago. She is marked *in memoriam*, so she leaves the score and the default graph without counting as a failure to keep in touch.

**What the figures show:**
- Score 8. The trend steps down from 9 to 8 around Margaret's death and stays there.
- The closeness bars lose one relationship and gain grey for Josh.
- This shows a small but well-tended network, and handles bereavement gently.

## 6. A university student (`student`)

- **Home:** two housemates, Kai and Mo, both marked *living together*.
- **Groups:** a weekly **Study group** and a twice-weekly **Climbing club**.
- **A new friend:** Jess joined the club four months ago and is now seen fortnightly outside it too.
- **Family:** Mum calls weekly and Dad monthly, with a visit home at the start of each term.
- **Friends from home:** Ellie and Tom moved from fortnightly to monthly video calls. Tom faded out and is now lost touch.
- **Exams:** an exam period 20 to 40 days ago brings more study-group sessions and fewer climbing sessions.

**What the figures show:** score 8, with a gentle dip to 7 in the spring and around exams, then recovering as the new friendship settles in.

## 7. A parent of three (`parentOfThree`)

- **At home:** partner Chris, Mia (aged 2) and Leo (aged 15), all *living together*. Conversations with Leo move from *good* to *okay* three months ago, and he now sits at 6 (drifting a little), despite daily contact.
- **Ava (aged 21) moved out 120 days ago.** She changes from living together to a weekly video call plus a monthly family visit, and stays Close (10).
- **Family support:** Grandma Rose helps weekly.
- **Groups and friends:**
  - The **School gate** group on school days, where Hana, another parent, becomes a friend.
  - Old friends Jade and Sol are seen less often.
- **Work:** a weekly colleague.

**What the figures show:**
- Score 9 and flat: the highest number of catch-ups of any life (1,135).
- The closeness bars show the teenager's relationship as the one amber.
- This shows the score separating *how much* contact there is from *how close* the relationship is.

## 8. New in town (`newInTown`), an extra scenario

This person **moved to a new city 75 days ago**.

- **Old friends:** close friends Nat and Ollie, seen every Friday, move to video calls and messages.
- **Family:** Mum moves from Sunday visits to video calls.
- **Old team:** it is archived after the move.
- **Filling in:** a **New team** at work with a colleague, Lena, then a **Running club** from 50 days ago where they meet Kofi, now a friend, and a neighbour, Mrs Dunn.
- **A visit home:** one month ago, seeing everyone.

**What the figures show:**
- The clearest shape of all: the trend dips from 9 to 6 in the weeks after the move, then climbs back to 8 or 9 as new relationships form.
- Catch-ups per week fall, then rise above where they started.
- This is a useful figure for showing how the score tracks a transition rather than judging it.
