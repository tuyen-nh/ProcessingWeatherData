In a real production system, there is usually a Producer (a piece of code, like a Python script or a Java app) that fetches the crypto prices from an API. It sends that data to Kafka.

From Kafka, the data "fans out" (replicates) into two parallel tracks:

1. The "Storage" Track (To HDFS)
The Action: Kafka sends a copy of every single message to HDFS.

The Result: Your HDFS "Data Lake" grows bigger every second. It already has the 200 days of history, and now it is adding "Today" to the pile.

The Goal: To make sure that tomorrow, when the Hadoop Batch Job runs, it has a complete record of everything that happened today.

2. The "Speed" Track (To Spark)
The Action: At the exact same time, Kafka sends another copy of that same message to Spark Streaming.

The Result: Spark doesn't care about the 200 days of history right now. It only cares about the last 10 seconds or 1 minute.

The Goal: To update the "Live Price" on your dashboard immediately so the user doesn't have to wait for a Hadoop job to finish.