package tn.insat.tp3;

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.api.java.UDF2;
import org.apache.spark.sql.types.DataTypes;
import static org.apache.spark.sql.functions.*;

public class BatchWeatherAnalytics {
    public static void main(String[] args) {
        // Initialize Spark Session
        SparkSession spark = SparkSession.builder()
                .appName("Vietnam Batch Weather Analytics")
                .master("local[*]") // LOCAL: remove when deploying via spark-submit to cluster
                // Disable broadcast join to demonstrate Sort-Merge Join (Requirement 3: Sort-merge join)
                .config("spark.sql.autoBroadcastJoinThreshold", -1)
                .config("spark.hadoop.dfs.client.use.datanode.hostname", "true")
                .getOrCreate();

        // Requirement 2: Custom UDF (Calculate Heat Index/Perceived Temperature)
        // A simple formula based approximation
        UDF2<Double, Double, Double> heatIndexUDF = (temperature, humidity) -> {
            if (temperature == null || humidity == null) return null;
            // Simple approximation for demonstration: T + 0.05 * humidity
            return Math.round((temperature + (0.05 * humidity)) * 10.0) / 10.0;
        };
        // Registering the UDF with Spark
        spark.udf().register("calculateHeatIndex", heatIndexUDF, DataTypes.DoubleType);

        // 1. Read the Master Dataset (Historical CSVs + Streaming Parquet Dumps)
        System.out.println("Reading Weather Data from Master Dataset...");
        Dataset<Row> weatherDf = null;

        Dataset<Row> historicalDf = null;
        try {
            System.out.println("Attempting to load historical CSV dataset from HDFS...");
            historicalDf = spark.read()
                    .option("header", "true")
                    .option("inferSchema", "true")
                    // The path where the manual CSV export is stored in HDFS
                    // .csv("hdfs://namenode:9000/user/data/raw/weather_data/")
                    .csv("hdfs://localhost:9000/user/data/raw/weather_data/") // LOCAL: namenode -> localhost
                    .withColumnRenamed("time", "timestamp")
                    .withColumn("date", to_date(col("timestamp")))
                    .withColumn("temp", col("temp").cast(DataTypes.DoubleType))
                    .withColumn("rhum", col("rhum").cast(DataTypes.DoubleType))
                    .withColumnRenamed("temp", "temperature")
                    .withColumnRenamed("rhum", "humidity");
                    // station_id not available in historical CSV — will be null after unionByName
                    // pm25/no2 not available in historical CSV — will be null after unionByName
                    // unionByName(allowMissingColumns=true) handles this gracefully
        } catch (Exception e) {
            System.out.println("No historical CSV dataset found on HDFS at /user/data/raw/weather_data/ (" + e.getMessage() + ")");
        }

        Dataset<Row> streamedDf = null;
        try {
            System.out.println("Attempting to load streaming Parquet dataset from HDFS...");
            streamedDf = spark.read()
                    // The path where KafkaToHDFSDumper writes new Parquet data
                    // .parquet("hdfs://namenode:9000/user/data/raw/weather_data_stream/");
                    .parquet("hdfs://localhost:9000/user/data/raw/weather_data_stream/"); // LOCAL: namenode -> localhost
        } catch (Exception e) {
            System.out.println("No streaming Parquet dataset found on HDFS at /user/data/raw/weather_data_stream/ (" + e.getMessage() + ")");
        }

        // Union the datasets if both exist
        if (historicalDf != null && streamedDf != null) {
            System.out.println("Combining historical and streaming datasets.");
            // allowMissingColumns=true prevents crashes if schemas differ slightly
            weatherDf = historicalDf.unionByName(streamedDf, true);
        } else if (historicalDf != null) {
            System.out.println("Using only historical dataset.");
            weatherDf = historicalDf;
        } else if (streamedDf != null) {
            System.out.println("Using only streaming dataset.");
            weatherDf = streamedDf;
        }

        // Fallback to local mock data if absolutely nothing is on HDFS
        if (weatherDf == null) {
            System.err.println("No datasets found on HDFS. Falling back to local mock CSV data...");
            weatherDf = spark.read()
                    .option("header", "true")
                    .option("inferSchema", "true")
                    // Upload this CSV to HDFS first:
                    // docker cp vietnam_weather_batch.csv namenode:/tmp/
                    // docker exec namenode hdfs dfs -put /tmp/vietnam_weather_batch.csv hdfs://namenode:9000/user/data/raw/
                    // .csv("hdfs://namenode:9000/user/data/raw/vietnam_weather_batch.csv");
                    .csv("hdfs://localhost:9000/user/data/raw/vietnam_weather_batch.csv"); // LOCAL: namenode -> localhost
        }

        // 2. Read the static Geography data
        System.out.println("Reading Station Data...");
        Dataset<Row> stationsDf = spark.read()
                .option("header", "true")
                .option("inferSchema", "true")
                .option("ignoreLeadingWhiteSpace", "true")
                .option("ignoreTrailingWhiteSpace", "true")
                // .csv("hdfs://namenode:9000/user/data/static/vietnam_stations.csv");
                .csv("hdfs://localhost:9000/user/data/static/vietnam_stations.csv"); // LOCAL: namenode -> localhost

        // Requirement 3: Sort-Merge Join
        // Since we disabled autoBroadcastJoinThreshold, Spark will use SortMergeJoin for this
        Dataset<Row> enrichedDf = weatherDf.join(stationsDf, "station_id");

        // Complex Multi-stage Transformation (Req 2)
        Dataset<Row> transformedDf = enrichedDf
                .withColumn("heat_index", callUDF("calculateHeatIndex", col("temperature"), col("humidity")))
                .withColumn("weather_condition", 
                    when(col("pm25").gt(150), "Hazardous")
                    .when(col("temperature").gt(35), "Extreme Heat")
                    .otherwise("Normal"));

        // Requirement 4: Caching/Persistence strategy
        transformedDf.cache();

        transformedDf.show();

        // Requirement 1: Complex Aggregation — Per-Province Stats (all 34 stations)
        System.out.println("--- Per-Province Analytics (34 Stations) ---");
        Dataset<Row> provinceDf = transformedDf
                .groupBy("station_id", "province", "region")
                .agg(
                    round(avg("temperature"), 1).alias("avg_temp"),
                    round(max("temperature"), 1).alias("max_temp"),
                    round(avg("humidity"), 1).alias("avg_humidity"),
                    round(avg("pm25"), 2).alias("avg_pm25"),
                    round(avg("no2"), 2).alias("avg_no2"),
                    count("*").alias("record_count")
                )
                .orderBy("region", "province");
        provinceDf.show(34, false);

        // Requirement 1: Complex Aggregation (Pivot)
        // Pivoting data to see average PM2.5 by region across dates
        System.out.println("--- Average PM2.5 Pivoted By Region ---");
        Dataset<Row> pivotedDf = transformedDf
                .groupBy("date")
                .pivot("region") // Pivots regions (North, Central, South) as columns
                .agg(round(avg("pm25"), 2).alias("avg_pm25"));

        pivotedDf.show();

        // Requirement 4: Partition Pruning and Bucketing
        // Saving the output partitioned by Region heavily optimizes future querying!
        System.out.println("Saving analytical results via Partitioning...");
        String outputPath = "hdfs://localhost:9000/user/data/processed/weather_historical.parquet";
        
        try {
            transformedDf.write()
                .mode("overwrite")
                .partitionBy("region", "date") // Requirement 4: Partitioning
                .parquet(outputPath);
            System.out.println("Saved successfully to " + outputPath);
        } catch (Exception e) {
            System.out.println("Could not save to Parquet. Error: " + e.getMessage());
        }

        // --- LAMBDA ARCHITECTURE: SERVING LAYER ---
        // Writing the Batch views to MongoDB so they can be queried alongside the Speed Layer
        System.out.println("Pushing Batch Aggregations to MongoDB (Serving Layer)...");

        // Collection 1: Region-level pivot (avg PM2.5 per region per date)
        try {
            pivotedDf.write()
                .format("mongo")
                .mode("overwrite")
                .option("spark.mongodb.output.uri", "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                .option("spark.mongodb.output.database", "Big_Data")
                .option("spark.mongodb.output.collection", "BatchHistoricalAggregations")
                .save();
            System.out.println("Successfully pushed Region Pivot to MongoDB!");
        } catch (Exception e) {
            System.out.println("Could not save Region Pivot to MongoDB. Error: " + e.getMessage());
        }

        // Collection 2: Province-level stats (all 34 stations)
        try {
            provinceDf.write()
                .format("mongo")
                .mode("overwrite")
                .option("spark.mongodb.output.uri", "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                .option("spark.mongodb.output.database", "Big_Data")
                .option("spark.mongodb.output.collection", "ProvinceAggregations")
                .save();
            System.out.println("Successfully pushed Province Aggregations (34 stations) to MongoDB!");
        } catch (Exception e) {
            System.out.println("Could not save Province Aggregations to MongoDB. Error: " + e.getMessage());
        }

        spark.stop();
    }
}
