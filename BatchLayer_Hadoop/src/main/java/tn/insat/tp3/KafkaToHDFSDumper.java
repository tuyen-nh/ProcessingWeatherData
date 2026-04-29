package tn.insat.tp3;

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.streaming.OutputMode;
import org.apache.spark.sql.streaming.StreamingQuery;
import org.apache.spark.sql.streaming.Trigger;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructType;
import static org.apache.spark.sql.functions.*;

public class KafkaToHDFSDumper {
    public static void main(String[] args) throws Exception {
        SparkSession spark = SparkSession.builder()
                .appName("Kafka to HDFS Data Lake Dumper")
                .config("spark.hadoop.dfs.client.use.datanode.hostname", "true")
                .getOrCreate();

        // 1. Define the exact schema of incoming Kafka JSON records
        StructType incomingSchema = new StructType()
                .add("date", DataTypes.StringType)
                .add("timestamp", DataTypes.TimestampType)
                .add("station_id", DataTypes.StringType)
                .add("temperature", DataTypes.DoubleType)
                .add("humidity", DataTypes.DoubleType)
                .add("pm25", DataTypes.DoubleType)
                .add("no2", DataTypes.DoubleType);

        // 2. Read RAW stream from Kafka
        Dataset<Row> rawStream = spark.readStream()
                .format("kafka")
                .option("kafka.bootstrap.servers", "kafka1:9092,kafka2:9093,kafka3:9094")
                .option("subscribe", "vn_weather_stream")
                .option("startingOffsets", "latest")
                .load();

        // 3. Convert Kafka Value to Structured DataFrame
        Dataset<Row> parsedStream = rawStream
                .selectExpr("CAST(value AS STRING)")
                .select(from_json(col("value"), incomingSchema).alias("data"))
                .select("data.*");

        // 4. Dump everything into the "Master Dataset" on Hard Drive/HDFS
        // Using OutputMode.Append() to continuously add new JSON records as Parquet files
        StreamingQuery query = parsedStream.writeStream()
                .outputMode(OutputMode.Append())
                .format("parquet")
                // This becomes the master historical folder for Batch Analytics on HDFS
                .option("path", "hdfs://namenode:9000/user/data/raw/weather_data_stream/")
                .option("checkpointLocation", "hdfs://namenode:9000/checkpoints/hdfs_dumper")
                // Flushes data to HDFS every 1 minute
                .trigger(Trigger.ProcessingTime("1 minute"))
                .start();

        System.out.println("Started HDFS Dumper. Listening to Kafka and writing to master_dataset...");
        query.awaitTermination();
    }
}