# cocktailbot-core

Fully automated cocktail and longdrink mixer written in Javascript.

Configuration Options
-

| Name                     | Type    | Unit | Default      | Description                                                                                             |
|--------------------------|---------|------|--------------|---------------------------------------------------------------------------------------------------------|
| backwashTime             | integer | ms   | 5000         | How long to pump water from fresh water tank to used water tank to clean pipe after each produced drink |
| minStartWeight           | integer | g    | 100          | Pumping only starts when weight is above this value to prevent pumping without a glass present          |
| pumpLostAmount           | integer | ml   | 5            | How much liquid is lost during filling process. Used to calculate reservoir amount                      |
| pumpOvershootAmount      | integer | ml   | 10           | How much liquid is dripping out after pump is stopped                                                   |
| pumpOvershootSettleTime  | integer | ms   | 1000         | How long to wait after stopping pump before measuring actual pumped amount                              |
| pumpTimeout              | integer | ms   | 10000        | How long to wait for filling to start after starting pump                                               |
| reversePumpTime          | integer | ms   | 2500         | How long to reverse pumping direction after pumping ingredient                                          |
| serialBaud               | integer | baud | 9600         | Interface communication baud rate                                                                       |
| serialCommandTermination | string  |      | \n           | Termination symbol for interface communitation                                                          |
| serialPort               | string  |      | /dev/ttyUSB0 | Interface serial port                                                                                   |
| serialTimeout            | integer | ms   | 1000         | How long to wait for interface to respond before retrying or throwing error                             |
