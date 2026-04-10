# Big Data Processing Workflow with HDFS (Hadoop on Docker)

Processing Big Data using distributed storage systems like HDFS involves a multi-step workflow designed to handle massive volumes of data. Below is the complete workflow tailored specifically for a **Weather Data Project** running in a **Docker** environment.

## 1. Data Ingestion (Collection) & 2. Distributed Storage (HDFS)
The first step is moving the data file (e.g., `weather.csv`) from your host machine into the Hadoop cluster (HDFS). 

Since you are running Hadoop via Docker, you cannot run `hdfs dfs` directly on your host machine. You need to bridge the file: **Host Machine -> Container -> HDFS**.

### HDFS Command Line Examples (for Docker)
Execute the following commands sequentially in your Terminal (ensure your `weather.csv` file is in the current working directory):

```bash
# 0. Copy the file from your local machine to the /tmp/ directory of the namenode container
docker cp ./weather.csv namenode:/tmp/weather.csv

# 1. Create a directory in HDFS for your raw weather data
docker exec -it namenode hdfs dfs -mkdir -p /user/data/raw/weather_data

# 2. Upload the CSV file (from the container's /tmp) into the HDFS directory
docker exec -it namenode hdfs dfs -put /tmp/weather.csv /user/data/raw/weather_data/

# 3. List the files in the HDFS directory to verify
docker exec -it namenode hdfs dfs -ls /user/data/raw/weather_data/

# 4. View the first few lines of the uploaded file
docker exec -it namenode hdfs dfs -cat /user/data/raw/weather_data/weather.csv | head -n 5
```

## 3. Data Processing & Transformation (Compute)
Once the data is securely stored in HDFS, the next step is processing it. Below are two industry-standard approaches: using **Hadoop MapReduce (Java)** or **Apache Spark (Python/Java)**.

### Option A: Hadoop MapReduce Example (Classic Java)
This is the original Hadoop approach. MapReduce divides the work into two phases: `Map` (filtering) and `Reduce` (aggregating). Below is a Java example that finds the maximum temperature for each region.

```java
import java.io.IOException;
import org.apache.hadoop.io.DoubleWritable;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.mapreduce.Mapper;
import org.apache.hadoop.mapreduce.Reducer;

// 1. The Mapper Class
// Extracts the Region and the Temperature from each line
public class WeatherMapper extends Mapper<Object, Text, Text, DoubleWritable> {
    private Text region = new Text();
    private DoubleWritable temp = new DoubleWritable();

    public void map(Object key, Text value, Context context) throws IOException, InterruptedException {
        String[] columns = value.toString().split(",");
        // Assuming CSV structure: date, region, temp, humidity
        if (columns.length == 4 && !columns[0].equals("date")) { 
            region.set(columns[1]); // e.g., "Hanoi"
            temp.set(Double.parseDouble(columns[2])); // e.g., 32.5
            context.write(region, temp); // Emits key-value pair: (Hanoi, 32.5)
        }
    }
}

// 2. The Reducer Class
// Aggregates all recorded temperatures for a specific region and finds the Max
public class WeatherReducer extends Reducer<Text, DoubleWritable, Text, DoubleWritable> {
    private DoubleWritable maxTemp = new DoubleWritable();

    public void reduce(Text key, Iterable<DoubleWritable> values, Context context) throws IOException, InterruptedException {
        double max = Double.MIN_VALUE;
        for (DoubleWritable val : values) {
            max = Math.max(max, val.get());
        }
        maxTemp.set(max);
        context.write(key, maxTemp); // Final Output: (Hanoi, 39.5)
    }
}
```

*To run this MapReduce job, you would compile it into a `.jar` file and execute it using:*
`hadoop jar SalesJob.jar SalesDriver /user/data/raw/sales_data /user/data/processed/sales_output`

### Option B: PySpark Example (Batch Layer in Lambda Architecture)
While MapReduce requires a lot of code and reads/writes to disk frequently, Spark does the same task with less code and processes it in memory. 

In a **Lambda Architecture**, this script represents typical **Batch Layer** processing. It reads the immutable master dataset (raw data) from HDFS, processes the entire batch, and outputs an optimized columnar format (Parquet) to be used by the **Serving Layer**.

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, to_date

# 1. Initialize SparkSession
spark = SparkSession.builder.appName("WeatherDataProcessing").getOrCreate()

# 2. Read raw CSV data from HDFS
raw_df = spark.read.csv("hdfs:///user/data/raw/weather_data/weather.csv", header=True, inferSchema=True)

# 3. Data Cleaning and Transformation
# Filtering out records with missing temperature data and fixing the date format
processed_df = raw_df \
    .filter(col("temp").isNotNull()) \
    .withColumn("record_date", to_date(col("date_string"), "yyyy-MM-dd")) \
    .drop("date_string")

# 4. Write the processed data back to HDFS in Parquet format
output_path = "hdfs:///user/data/processed/weather_data/"
processed_df.write.mode("overwrite").parquet(output_path)

spark.stop()
```

### Option C: Spark Java Example (Batch Layer in Lambda Architecture)
For projects strictly using Java, Spark provides a Java API that achieves the exact same in-memory distributed processing as the Python version.

```java
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import static org.apache.spark.sql.functions.col;
import static org.apache.spark.sql.functions.to_date;
import org.apache.spark.sql.SaveMode;

public class WeatherDataBatchProcessing {
    public static void main(String[] args) {
        // 1. Initialize SparkSession (Entry point for the Spark application)
        SparkSession spark = SparkSession.builder()
                .appName("WeatherDataBatchProcessing")
                .getOrCreate();
        
        // 2. Read raw CSV data from HDFS
        Dataset<Row> rawDF = spark.read()
                .option("header", "true")
                .option("inferSchema", "true")
                .csv("hdfs:///user/data/raw/weather_data/weather.csv");
                
        // 3. Data Cleaning and Transformation
        // Filtering out records with missing temperature data and fixing the date format
        Dataset<Row> processedDF = rawDF
                .filter(col("temp").isNotNull())
                .withColumn("record_date", to_date(col("date_string"), "yyyy-MM-dd"))
                .drop("date_string");
                
        // 4. Write the processed data back to HDFS in Parquet format
        processedDF.write()
                .mode(SaveMode.Overwrite)
                .parquet("hdfs:///user/data/processed/weather_data/");
                
        spark.stop();
    }
}
```

## 4. Data Warehousing & Querying (Analysis)
Once data is processed and structured, it's typically modeled for quick querying using an SQL engine like **Apache Hive** or **Spark SQL**.

### Spark SQL Example (Weather Analytics)
You can use standard SQL to perform advanced analytics, such as average temperature and total precipitation by region.

```python
# Assuming you have an active SparkSession 'spark'

# 1. Read the processed Parquet data back from HDFS
processed_df = spark.read.parquet("hdfs:///user/data/processed/weather_data/")

# 2. Create a temporary view to run SQL queries against it
processed_df.createOrReplaceTempView("weather")

# 3. Run a SQL query
query = """
    SELECT 
        region, 
        AVG(temp) as avg_temperature,
        SUM(precipitation) as total_precipitation
    FROM weather
    GROUP BY region
    ORDER BY avg_temperature DESC
"""

result_df = spark.sql(query)

# 4. Show the results on the screen
result_df.show()
```

## 5. Data Consumption & Visualization
The final step is serving the processed insights.
*   **BI Tools:** Tableau or PowerBI can connect directly to Hive or Spark via JDBC/ODBC to visualize the output.
*   **Application Backend / Serving Layer (NoSQL):** Instead of storing final results back to HDFS as Parquet, you can write the `processedDf` directly into a fast NoSQL database like **MongoDB** or **Cassandra** so that a web application can query it instantly.

#### Spark Java Example: Writing Processed Data to MongoDB
To do this, you need to add the **MongoDB Spark Connector** dependency in your `pom.xml`. Then, replace the Parquet writing step in your Java code with the following:

```java
// Configure MongoDB URI when building SparkSession
SparkSession spark = SparkSession.builder()
        .appName("SalesDataBatchProcessing")
        .config("spark.mongodb.output.uri", "mongodb://127.0.0.1:27017/bigdata_db.sales_summary")
        .getOrCreate();

// ... (your data cleaning logic here) ...

// Write the DataFrame directly into MongoDB Collection 'sales_summary'
processedDf.write()
        .format("mongo") // or "mongodb" for connector v10+
        .mode(SaveMode.Append)
        .save();
```

---

### Summary of the Data Flow
`Sources -> HDFS commands (Ingestion) -> HDFS (Raw Data) -> MapReduce / Spark (Processing) -> HDFS (Cleaned Data) -> Hive / Spark SQL (Analytics) -> Output for BI`
