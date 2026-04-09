# Big Data Processing Workflow with HDFS (Hadoop Distributed File System)

Processing Big Data using distributed storage systems like HDFS involves a multi-step workflow designed to handle massive volumes of data efficiently, fault-tolerantly, and in parallel. Below is the standard end-to-end workflow along with code examples.

## 1. Data Ingestion (Collection) & 2. Distributed Storage (HDFS)
The first step is gathering raw data and moving it into the Hadoop ecosystem. Once ingested, data is stored in a distributed manner across the HDFS cluster.

### HDFS Command Line Examples
You typically use the `hdfs dfs` command line utility to interact with the file system.

```bash
# 1. Create a directory in HDFS for your raw data
hdfs dfs -mkdir -p /user/data/raw/sales_data

# 2. Upload a local CSV file into the HDFS directory
hdfs dfs -put ./local_sales_data.csv /user/data/raw/sales_data/

# 3. List the files in the HDFS directory to verify
hdfs dfs -ls /user/data/raw/sales_data/

# 4. View the first few lines of the uploaded file
hdfs dfs -cat /user/data/raw/sales_data/local_sales_data.csv | head -n 5
```

## 3. Data Processing & Transformation (Compute)
Raw data stored in HDFS must be cleaned, transformed, and aggregated. Historically, **Hadoop MapReduce** was the primary way to do this. Today, **Apache Spark** is the modern standard because it is much faster (in-memory processing). Below are examples of both.

### Option A: Hadoop MapReduce Example (Classic Approach)
MapReduce splits processing into two phases: `Map` (filtering/sorting) and `Reduce` (summarizing). Here is a classic Java MapReduce example for calculating Total Sales by Category.

```java
import java.io.IOException;
import org.apache.hadoop.io.DoubleWritable;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.mapreduce.Mapper;
import org.apache.hadoop.mapreduce.Reducer;

// 1. The Mapper Class
// Takes a line of text, extracts category and sales amount
public class SalesMapper extends Mapper<Object, Text, Text, DoubleWritable> {
    private Text category = new Text();
    private DoubleWritable amount = new DoubleWritable();

    public void map(Object key, Text value, Context context) throws IOException, InterruptedException {
        String[] columns = value.toString().split(",");
        // Assuming CSV format: transaction_id, category, amount, date
        if (columns.length == 4 && !columns[0].equals("transaction_id")) { 
            category.set(columns[1]); // e.g., "Electronics"
            amount.set(Double.parseDouble(columns[2])); // e.g., 299.99
            context.write(category, amount); // Key-Value pair emitted
        }
    }
}

// 2. The Reducer Class
// Receives all amounts for a specific category and sums them up
public class SalesReducer extends Reducer<Text, DoubleWritable, Text, DoubleWritable> {
    private DoubleWritable result = new DoubleWritable();

    public void reduce(Text key, Iterable<DoubleWritable> values, Context context) throws IOException, InterruptedException {
        double sum = 0;
        for (DoubleWritable val : values) {
            sum += val.get();
        }
        result.set(sum);
        context.write(key, result); // Final output: Category -> Total Sum
    }
}
```

*To run this MapReduce job, you would compile it into a `.jar` file and execute it using:*
`hadoop jar SalesJob.jar SalesDriver /user/data/raw/sales_data /user/data/processed/sales_output`

### Option B: PySpark Example (Modern Approach)
While MapReduce requires a lot of code and reads/writes to disk frequently, Spark does the same task with less code and processes it in memory.

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, to_date

# 1. Initialize SparkSession
spark = SparkSession.builder.appName("SalesDataProcessing").getOrCreate()

# 2. Read raw CSV data from HDFS
raw_df = spark.read.csv("hdfs:///user/data/raw/sales_data/local_sales_data.csv", header=True, inferSchema=True)

# 3. Data Cleaning and Transformation
processed_df = raw_df \
    .filter(col("amount").isNotNull()) \
    .filter(col("amount") > 0) \
    .withColumn("sale_date", to_date(col("date_string"), "yyyy-MM-dd")) \
    .drop("date_string")

# 4. Write the processed data back to HDFS in Parquet format
output_path = "hdfs:///user/data/processed/sales_data/"
processed_df.write.mode("overwrite").parquet(output_path)

spark.stop()
```

## 4. Data Warehousing & Querying (Analysis)
Once data is processed and structured, it's typically modeled for quick querying using an SQL engine like **Apache Hive** or **Spark SQL**.

### Spark SQL / Hive Example
You can analyze the processed output using standard SQL syntax. 

```python
# Assuming you have an active SparkSession 'spark'

# 1. Read the processed Parquet data back from HDFS
processed_df = spark.read.parquet("hdfs:///user/data/processed/sales_data/")

# 2. Create a temporary view to run SQL queries against it
processed_df.createOrReplaceTempView("sales")

# 3. Run a SQL query to aggregate total sales by product category
query = """
    SELECT 
        category, 
        SUM(amount) as total_sales,
        COUNT(*) as total_transactions
    FROM sales
    GROUP BY category
    ORDER BY total_sales DESC
"""

result_df = spark.sql(query)

# 4. Show the results on the screen
result_df.show()
```

## 5. Data Consumption & Visualization
The final step is serving the processed insights.
*   **BI Tools:** Tableau or PowerBI can connect directly to Hive or Spark via JDBC/ODBC to visualize the output.
*   **Application Backend:** You might export the small, aggregated summary CSV back to a traditional database like MySQL or PostgreSQL for a web application to consume using tools like Apache Sqoop.

---

### Summary of the Data Flow
`Sources -> HDFS commands (Ingestion) -> HDFS (Raw Data) -> MapReduce / Spark (Processing) -> HDFS (Cleaned Data) -> Hive / Spark SQL (Analytics) -> Output for BI`
