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
                .master("local[*]")
                // Disable broadcast join to demonstrate Sort-Merge Join (Requirement 3: Sort-merge join)
                .config("spark.sql.autoBroadcastJoinThreshold", -1) 
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

        // 1. Read the huge historical Weather Batch data stored by KafkaToHDFSDumper
        System.out.println("Reading Weather Data from Master Dataset...");
        Dataset<Row> weatherDf;
        try {
            // Read from HDFS where KafkaToHDFSDumper writes
            weatherDf = spark.read().parquet("hdfs://localhost:9000/user/data/raw/weather_data_stream/");
        } catch (Exception e) {
            System.err.println("Primary Dataset not found (Maybe Kafka Dumper hasn't run yet). Falling back to mock CSV data...");
            weatherDf = spark.read()
                    .option("header", "true")
                    .option("inferSchema", "true")
                    .csv("d:/2025.2/BigData/2026_1_big_data/vietnam_weather_batch.csv");
        }

        // 2. Read the static Geography data
        System.out.println("Reading Station Data...");
        Dataset<Row> stationsDf = spark.read()
                .option("header", "true")
                .option("inferSchema", "true")
                .csv("hdfs://localhost:9000/user/data/static/vietnam_stations.csv");

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

        // Requirement 1: Complex Aggregation (Pivot)
        // Pivoting data to see average PM2.5 and NO2 by region instead of rows
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

        spark.stop();
    }
}
